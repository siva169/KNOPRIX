"""Knoprix-ID contacts and consent-based, per-resource sharing."""
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..database import get_db
from ..security import DatabaseRateLimiter, get_current_user, get_owned_document

router = APIRouter(prefix="/api/v1", tags=["contacts and sharing"])
KNOPRIX_ID_RE = re.compile(r"^KP-[0-9A-HJKMNP-TV-Z]{10}$")
_contact_lookup_limiter = DatabaseRateLimiter(60, 3600, "knoprix-id-lookup")
_contact_request_limiter = DatabaseRateLimiter(20, 86400, "contact-request")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _expires_in(days: int = 30) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat(
        timespec="microseconds"
    )


def _expire_pending_requests(db) -> None:
    now = _now()
    db.execute(
        """UPDATE contact_requests SET status = 'expired', updated_at = ?
           WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?""",
        (now, now),
    )
    db.execute(
        """UPDATE shares SET status = 'expired', updated_at = ?
           WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?""",
        (now, now),
    )


def _pair(first: str, second: str) -> tuple[str, str]:
    return tuple(sorted((first, second)))


def _blocked(db, first: str, second: str) -> bool:
    return db.execute(
        "SELECT 1 FROM user_blocks WHERE "
        "(blocker_id = ? AND blocked_id = ?) OR "
        "(blocker_id = ? AND blocked_id = ?)",
        (first, second, second, first),
    ).fetchone() is not None


def _is_contact(db, first: str, second: str) -> bool:
    low, high = _pair(first, second)
    return db.execute(
        "SELECT 1 FROM contacts WHERE user_low = ? AND user_high = ?",
        (low, high),
    ).fetchone() is not None


def _add_inbox_item(
    db,
    user_id: str,
    actor_id: str | None,
    event_type: str,
    relationship_id: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
) -> None:
    db.execute(
        """INSERT INTO inbox_items
           (id, user_id, actor_id, event_type, resource_type, resource_id,
            relationship_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            str(uuid.uuid4()),
            user_id,
            actor_id,
            event_type,
            resource_type,
            resource_id,
            relationship_id,
            _now(),
        ),
    )


class ContactRequestBody(BaseModel):
    knoprixId: str = Field(min_length=13, max_length=13)


class ShareBody(BaseModel):
    recipientKnoprixIds: list[str] = Field(min_length=1, max_length=20)
    resourceType: str = Field(pattern="^(document|bookmark|highlight)$")
    resourceId: str = Field(min_length=1, max_length=128)


class LinkHighlightBody(BaseModel):
    highlightId: str = Field(min_length=1, max_length=128)


class PrivacyBody(BaseModel):
    allowIdLookup: bool
    allowContactRequests: bool
    emailNotificationsEnabled: bool


@router.get("/profile")
def profile(user=Depends(get_current_user), db=Depends(get_db)):
    row = db.execute(
        """SELECT knoprix_id, allow_id_lookup, allow_contact_requests,
                  email_notifications_enabled
           FROM users WHERE id = ?""",
        (user["id"],),
    ).fetchone()
    return {
        "knoprixId": row["knoprix_id"],
        "allowIdLookup": bool(row["allow_id_lookup"]),
        "allowContactRequests": bool(row["allow_contact_requests"]),
        "emailNotificationsEnabled": bool(row["email_notifications_enabled"]),
        "emailNotificationsAvailable": False,
    }


@router.patch("/profile/privacy")
def update_privacy(
    body: PrivacyBody, user=Depends(get_current_user), db=Depends(get_db)
):
    db.execute(
        """UPDATE users SET allow_id_lookup = ?, allow_contact_requests = ?,
                  email_notifications_enabled = ? WHERE id = ?""",
        (
            int(body.allowIdLookup),
            int(body.allowContactRequests),
            int(body.emailNotificationsEnabled),
            user["id"],
        ),
    )
    return profile(user, db)


@router.get("/contacts/lookup/{knoprix_id}")
def lookup_contact(
    knoprix_id: str, user=Depends(get_current_user), db=Depends(get_db)
):
    public_id = knoprix_id.upper()
    if not KNOPRIX_ID_RE.fullmatch(public_id):
        raise HTTPException(404, "Knoprix ID not found")
    if not _contact_lookup_limiter.allow(db, user["id"]):
        raise HTTPException(429, "Knoprix ID lookup limit reached; try again later")
    row = db.execute(
        """SELECT id, knoprix_id FROM users
           WHERE knoprix_id = ? AND allow_id_lookup = 1
             AND allow_contact_requests = 1""",
        (public_id,),
    ).fetchone()
    if row is None or row["id"] == user["id"] or _blocked(db, user["id"], row["id"]):
        raise HTTPException(404, "Knoprix ID not found")
    return {"knoprixId": row["knoprix_id"]}


@router.get("/contacts")
def list_contacts(user=Depends(get_current_user), db=Depends(get_db)):
    rows = db.execute(
        """SELECT c.id AS contact_id, u.knoprix_id, u.full_name
           FROM contacts c
           JOIN users u ON u.id = CASE
               WHEN c.user_low = ? THEN c.user_high ELSE c.user_low END
           WHERE (c.user_low = ? OR c.user_high = ?)
             AND NOT EXISTS (
               SELECT 1 FROM user_blocks b
               WHERE (b.blocker_id = ? AND b.blocked_id = u.id)
                  OR (b.blocker_id = u.id AND b.blocked_id = ?)
             )
           ORDER BY u.knoprix_id""",
        (user["id"], user["id"], user["id"], user["id"], user["id"]),
    ).fetchall()
    return {
        "contacts": [
            {
                "contactId": row["contact_id"],
                "knoprixId": row["knoprix_id"],
                "fullName": row["full_name"],
            }
            for row in rows
        ]
    }


@router.get("/inbox")
def get_inbox(user=Depends(get_current_user), db=Depends(get_db)):
    _expire_pending_requests(db)
    contact_requests = db.execute(
        """SELECT r.id, u.knoprix_id, r.created_at
           FROM contact_requests r JOIN users u ON u.id = r.requester_id
           WHERE r.recipient_id = ? AND r.status = 'pending'
           ORDER BY r.created_at DESC""",
        (user["id"],),
    ).fetchall()
    share_requests = db.execute(
        """SELECT s.id, u.knoprix_id, s.resource_type, s.created_at
           FROM shares s JOIN users u ON u.id = s.sender_id
           WHERE s.recipient_id = ? AND s.status = 'pending'
           ORDER BY s.created_at DESC""",
        (user["id"],),
    ).fetchall()
    return {
        "contactRequests": [
            {
                "requestId": row["id"],
                "fromKnoprixId": row["knoprix_id"],
                "createdAt": row["created_at"],
            }
            for row in contact_requests
        ],
        "shareRequests": [
            {
                "shareId": row["id"],
                "fromKnoprixId": row["knoprix_id"],
                "resourceType": row["resource_type"],
                "createdAt": row["created_at"],
            }
            for row in share_requests
        ],
    }


@router.get("/blocks")
def list_blocks(user=Depends(get_current_user), db=Depends(get_db)):
    rows = db.execute(
        """SELECT u.knoprix_id FROM user_blocks b
           JOIN users u ON u.id = b.blocked_id
           WHERE b.blocker_id = ? ORDER BY u.knoprix_id""",
        (user["id"],),
    ).fetchall()
    return {"blockedKnoprixIds": [row["knoprix_id"] for row in rows]}


@router.post("/contact-requests", status_code=status.HTTP_201_CREATED)
def send_contact_request(
    body: ContactRequestBody, user=Depends(get_current_user), db=Depends(get_db)
):
    _expire_pending_requests(db)
    public_id = body.knoprixId.upper()
    if not KNOPRIX_ID_RE.fullmatch(public_id):
        raise HTTPException(404, "Knoprix ID not found")
    if not _contact_request_limiter.allow(db, user["id"]):
        raise HTTPException(429, "Contact request limit reached; try again later")
    recipient = db.execute(
        """SELECT id FROM users WHERE knoprix_id = ?
             AND allow_id_lookup = 1 AND allow_contact_requests = 1""",
        (public_id,),
    ).fetchone()
    if recipient is None:
        raise HTTPException(404, "Knoprix ID not found")
    recipient_id = recipient["id"]
    if recipient_id == user["id"]:
        raise HTTPException(400, "You cannot send a contact request to yourself")
    if _blocked(db, user["id"], recipient_id):
        raise HTTPException(403, "This contact request is not permitted")
    if _is_contact(db, user["id"], recipient_id):
        raise HTTPException(409, "You are already contacts")

    low, high = _pair(user["id"], recipient_id)
    request_id = str(uuid.uuid4())
    now = _now()
    inserted = db.execute(
        """INSERT INTO contact_requests
           (id, requester_id, recipient_id, user_low, user_high, status,
            created_at, expires_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
           ON CONFLICT(user_low, user_high) WHERE status = 'pending' DO NOTHING""",
        (request_id, user["id"], recipient_id, low, high, now, _expires_in(), now),
    )
    if inserted.rowcount != 1:
        raise HTTPException(409, "A contact request is already pending")
    _add_inbox_item(db, recipient_id, user["id"], "contact_request", request_id)
    return {"requestId": request_id, "status": "pending"}


@router.get("/contact-requests/sent")
def list_sent_contact_requests(user=Depends(get_current_user), db=Depends(get_db)):
    _expire_pending_requests(db)
    rows = db.execute(
        """SELECT r.id, r.status, r.created_at, u.knoprix_id
           FROM contact_requests r JOIN users u ON u.id = r.recipient_id
           WHERE r.requester_id = ? ORDER BY r.created_at DESC""",
        (user["id"],),
    ).fetchall()
    return {
        "requests": [
            {
                "requestId": row["id"],
                "status": row["status"],
                "createdAt": row["created_at"],
                "toKnoprixId": row["knoprix_id"],
            }
            for row in rows
        ]
    }


@router.delete(
    "/contact-requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT
)
def cancel_contact_request(
    request_id: str, user=Depends(get_current_user), db=Depends(get_db)
):
    _expire_pending_requests(db)
    updated = db.execute(
        """UPDATE contact_requests SET status = 'canceled', updated_at = ?
           WHERE id = ? AND requester_id = ? AND status = 'pending'""",
        (_now(), request_id, user["id"]),
    )
    if updated.rowcount != 1:
        raise HTTPException(404, "Pending outgoing contact request not found")
    return None


@router.post("/contact-requests/{request_id}/accept")
def accept_contact_request(
    request_id: str, user=Depends(get_current_user), db=Depends(get_db)
):
    _expire_pending_requests(db)
    request = db.execute(
        """SELECT requester_id, user_low, user_high FROM contact_requests
           WHERE id = ? AND recipient_id = ? AND status = 'pending'""",
        (request_id, user["id"]),
    ).fetchone()
    if request is None:
        raise HTTPException(404, "Pending contact request not found")
    requester_id = request["requester_id"]
    if _blocked(db, user["id"], requester_id):
        raise HTTPException(403, "This contact request is no longer permitted")
    now = _now()
    updated = db.execute(
        """UPDATE contact_requests SET status = 'accepted', expires_at = NULL,
                  updated_at = ?
           WHERE id = ? AND recipient_id = ? AND status = 'pending'""",
        (now, request_id, user["id"]),
    )
    if updated.rowcount != 1:
        raise HTTPException(409, "Contact request has already changed")
    db.execute(
        "INSERT INTO contacts (id, user_low, user_high, created_at) "
        "VALUES (?, ?, ?, ?) ON CONFLICT(user_low, user_high) DO NOTHING",
        (str(uuid.uuid4()), request["user_low"], request["user_high"], now),
    )
    _add_inbox_item(db, requester_id, user["id"], "contact_request", request_id)
    return {"requestId": request_id, "status": "accepted"}


@router.post("/contact-requests/{request_id}/decline")
def decline_contact_request(
    request_id: str, user=Depends(get_current_user), db=Depends(get_db)
):
    _expire_pending_requests(db)
    updated = db.execute(
        """UPDATE contact_requests SET status = 'declined', updated_at = ?
           WHERE id = ? AND recipient_id = ? AND status = 'pending'""",
        (_now(), request_id, user["id"]),
    )
    if updated.rowcount != 1:
        raise HTTPException(404, "Pending contact request not found")
    return {"requestId": request_id, "status": "declined"}


@router.delete("/contacts/{knoprix_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_contact(
    knoprix_id: str, user=Depends(get_current_user), db=Depends(get_db)
):
    recipient = db.execute(
        "SELECT id FROM users WHERE knoprix_id = ?", (knoprix_id.upper(),)
    ).fetchone()
    if recipient is None:
        raise HTTPException(404, "Contact not found")
    low, high = _pair(user["id"], recipient["id"])
    deleted = db.execute(
        "DELETE FROM contacts WHERE user_low = ? AND user_high = ?",
        (low, high),
    )
    if deleted.rowcount != 1:
        raise HTTPException(404, "Contact not found")
    _revoke_pair_shares(db, user["id"], recipient["id"])
    return None


def _revoke_pair_shares(db, first: str, second: str) -> None:
    now = _now()
    active = db.execute(
        """SELECT id, sender_id, recipient_id, resource_type, resource_id
           FROM shares WHERE status IN ('pending', 'accepted')
             AND ((sender_id = ? AND recipient_id = ?)
               OR (sender_id = ? AND recipient_id = ?))""",
        (first, second, second, first),
    ).fetchall()
    db.execute(
        """UPDATE shares SET status = 'revoked', updated_at = ?
           WHERE status IN ('pending', 'accepted')
             AND ((sender_id = ? AND recipient_id = ?)
               OR (sender_id = ? AND recipient_id = ?))""",
        (now, first, second, second, first),
    )
    for share in active:
        _add_inbox_item(
            db,
            share["recipient_id"],
            share["sender_id"],
            "share_revoked",
            share["id"],
            share["resource_type"],
            share["resource_id"],
        )


def revoke_resource_shares(db, owner_id: str, resource_type: str, resource_id: str) -> None:
    active = db.execute(
        """SELECT id, recipient_id FROM shares
           WHERE sender_id = ? AND resource_type = ? AND resource_id = ?
             AND status IN ('pending', 'accepted')""",
        (owner_id, resource_type, resource_id),
    ).fetchall()
    db.execute(
        """UPDATE shares SET status = 'revoked', updated_at = ?
           WHERE sender_id = ? AND resource_type = ? AND resource_id = ?
             AND status IN ('pending', 'accepted')""",
        (_now(), owner_id, resource_type, resource_id),
    )
    for share in active:
        _add_inbox_item(
            db,
            share["recipient_id"],
            owner_id,
            "share_revoked",
            share["id"],
            resource_type,
            resource_id,
        )


@router.post("/blocks", status_code=status.HTTP_201_CREATED)
def block_user(
    body: ContactRequestBody, user=Depends(get_current_user), db=Depends(get_db)
):
    public_id = body.knoprixId.upper()
    target = db.execute(
        "SELECT id FROM users WHERE knoprix_id = ?", (public_id,)
    ).fetchone()
    if not KNOPRIX_ID_RE.fullmatch(public_id) or target is None:
        raise HTTPException(404, "Knoprix ID not found")
    target_id = target["id"]
    if target_id == user["id"]:
        raise HTTPException(400, "You cannot block yourself")
    db.execute(
        """INSERT INTO user_blocks (id, blocker_id, blocked_id, created_at)
           VALUES (?, ?, ?, ?) ON CONFLICT(blocker_id, blocked_id) DO NOTHING""",
        (str(uuid.uuid4()), user["id"], target_id, _now()),
    )
    low, high = _pair(user["id"], target_id)
    now = _now()
    db.execute(
        """UPDATE contact_requests SET status = 'canceled', updated_at = ?
           WHERE status IN ('pending', 'accepted')
             AND ((requester_id = ? AND recipient_id = ?)
               OR (requester_id = ? AND recipient_id = ?))""",
        (now, user["id"], target_id, target_id, user["id"]),
    )
    db.execute(
        "DELETE FROM contacts WHERE user_low = ? AND user_high = ?", (low, high)
    )
    _revoke_pair_shares(db, user["id"], target_id)
    return {"knoprixId": public_id, "blocked": True}


@router.delete("/blocks/{knoprix_id}", status_code=status.HTTP_204_NO_CONTENT)
def unblock_user(
    knoprix_id: str, user=Depends(get_current_user), db=Depends(get_db)
):
    target = db.execute(
        "SELECT id FROM users WHERE knoprix_id = ?", (knoprix_id.upper(),)
    ).fetchone()
    if target is None:
        raise HTTPException(404, "Block not found")
    deleted = db.execute(
        "DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?",
        (user["id"], target["id"]),
    )
    if deleted.rowcount != 1:
        raise HTTPException(404, "Block not found")
    return None


def _owned_shareable_resource(db, user_id: str, resource_type: str, resource_id: str):
    if resource_type == "document":
        return get_owned_document(db, user_id, resource_id)
    if resource_type == "bookmark":
        row = db.execute(
            "SELECT * FROM bookmarks WHERE id = ? AND user_id = ?",
            (resource_id, user_id),
        ).fetchone()
    elif resource_type == "highlight":
        row = db.execute(
            "SELECT * FROM highlights WHERE id = ? AND user_id = ?",
            (resource_id, user_id),
        ).fetchone()
    else:
        row = None
    if row is None:
        raise HTTPException(404, "Shareable resource not found")
    return row


def _shared_resource_fields(resource_type: str) -> tuple[str, ...]:
    return {
        "document": ("id", "file_name", "file_type", "page_count"),
        "bookmark": (
            "name",
            "highlighted_text",
            "notes",
            "color_tag",
            "bookmark_type",
            "tags_json",
            "document_id",
            "page_number",
            "anchor_start",
            "anchor_end",
            "region_x",
            "region_y",
            "region_width",
            "region_height",
        ),
        "highlight": (
            "text",
            "color",
            "match_all",
            "highlight_type",
            "document_id",
            "page_number",
            "anchor_start",
            "anchor_end",
            "region_x",
            "region_y",
            "region_width",
            "region_height",
        ),
    }[resource_type]


@router.post("/shares", status_code=status.HTTP_201_CREATED)
def create_shares(body: ShareBody, user=Depends(get_current_user), db=Depends(get_db)):
    _expire_pending_requests(db)
    _owned_shareable_resource(db, user["id"], body.resourceType, body.resourceId)
    ids = [value.upper() for value in body.recipientKnoprixIds]
    if len(set(ids)) != len(ids) or any(not KNOPRIX_ID_RE.fullmatch(value) for value in ids):
        raise HTTPException(422, "Recipient Knoprix IDs must be valid and unique")
    recipient_rows = db.execute(
        f"""SELECT id, knoprix_id FROM users
            WHERE knoprix_id IN ({", ".join("?" for _ in ids)})""",
        tuple(ids),
    ).fetchall()
    recipients_by_public_id = {
        row["knoprix_id"]: row["id"]
        for row in recipient_rows
    }
    recipient_user_ids = list(recipients_by_public_id.values())
    blocked_user_ids = set()
    contact_user_ids = set()
    if recipient_user_ids:
        placeholders = ", ".join("?" for _ in recipient_user_ids)
        blocked_rows = db.execute(
            f"""SELECT blocker_id, blocked_id FROM user_blocks
                WHERE (blocker_id = ? AND blocked_id IN ({placeholders}))
                   OR (blocked_id = ? AND blocker_id IN ({placeholders}))""",
            (user["id"], *recipient_user_ids, user["id"], *recipient_user_ids),
        ).fetchall()
        blocked_user_ids = {
            row["blocked_id"] if row["blocker_id"] == user["id"] else row["blocker_id"]
            for row in blocked_rows
        }
        contact_rows = db.execute(
            f"""SELECT user_low, user_high FROM contacts
                WHERE (user_low = ? AND user_high IN ({placeholders}))
                   OR (user_high = ? AND user_low IN ({placeholders}))""",
            (user["id"], *recipient_user_ids, user["id"], *recipient_user_ids),
        ).fetchall()
        contact_user_ids = {
            row["user_high"] if row["user_low"] == user["id"] else row["user_low"]
            for row in contact_rows
        }
    shares = []
    for public_id in ids:
        recipient_id = recipients_by_public_id.get(public_id)
        if recipient_id is None:
            shares.append({"knoprixId": public_id, "status": "unavailable"})
            continue
        if (
            recipient_id == user["id"]
            or recipient_id in blocked_user_ids
            or recipient_id not in contact_user_ids
        ):
            shares.append({"knoprixId": public_id, "status": "not_eligible"})
            continue
        share_id = str(uuid.uuid4())
        now = _now()
        result = db.execute(
            """INSERT INTO shares
               (id, sender_id, recipient_id, resource_type, resource_id, status,
                created_at, expires_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
               ON CONFLICT(sender_id, recipient_id, resource_type, resource_id)
                 WHERE status IN ('pending', 'accepted') DO NOTHING""",
            (
                share_id,
                user["id"],
                recipient_id,
                body.resourceType,
                body.resourceId,
                now,
                _expires_in(),
                now,
            ),
        )
        if result.rowcount != 1:
            shares.append({"knoprixId": public_id, "status": "already_shared_or_pending"})
            continue
        _add_inbox_item(
            db,
            recipient_id,
            user["id"],
            "share_request",
            share_id,
            body.resourceType,
            body.resourceId,
        )
        shares.append({"knoprixId": public_id, "shareId": share_id, "status": "pending"})
    return {"shares": shares}


@router.post("/shares/{share_id}/accept")
def accept_share(share_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    _expire_pending_requests(db)
    share = db.execute(
        """SELECT sender_id, resource_type, resource_id FROM shares
           WHERE id = ? AND recipient_id = ? AND status = 'pending'""",
        (share_id, user["id"]),
    ).fetchone()
    if share is None:
        raise HTTPException(404, "Pending share request not found")
    if _blocked(db, user["id"], share["sender_id"]) or not _is_contact(
        db, user["id"], share["sender_id"]
    ):
        raise HTTPException(403, "This share request is no longer permitted")
    try:
        _owned_shareable_resource(
            db, share["sender_id"], share["resource_type"], share["resource_id"]
        )
    except HTTPException as exc:
        if exc.status_code == 404:
            raise HTTPException(410, "The shared resource is no longer available") from exc
        raise
    now = _now()
    updated = db.execute(
        """UPDATE shares SET status = 'accepted', accepted_at = ?, expires_at = NULL,
                  updated_at = ?
           WHERE id = ? AND recipient_id = ? AND status = 'pending'""",
        (now, now, share_id, user["id"]),
    )
    if updated.rowcount != 1:
        raise HTTPException(409, "Share request has already changed")
    _add_inbox_item(
        db,
        share["sender_id"],
        user["id"],
        "share_accepted",
        share_id,
        share["resource_type"],
        share["resource_id"],
    )
    return {"shareId": share_id, "status": "accepted"}


@router.post("/shares/{share_id}/decline")
def decline_share(share_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    _expire_pending_requests(db)
    updated = db.execute(
        """UPDATE shares SET status = 'declined', updated_at = ?
           WHERE id = ? AND recipient_id = ? AND status = 'pending'""",
        (_now(), share_id, user["id"]),
    )
    if updated.rowcount != 1:
        raise HTTPException(404, "Pending share request not found")
    return {"shareId": share_id, "status": "declined"}


@router.delete("/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_share(share_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    share = db.execute(
        """SELECT recipient_id, resource_type, resource_id FROM shares
           WHERE id = ? AND sender_id = ? AND status IN ('pending', 'accepted')""",
        (share_id, user["id"]),
    ).fetchone()
    if share is None:
        raise HTTPException(404, "Active share not found")
    db.execute(
        "UPDATE shares SET status = 'revoked', updated_at = ? "
        "WHERE id = ? AND sender_id = ? AND status IN ('pending', 'accepted')",
        (_now(), share_id, user["id"]),
    )
    _add_inbox_item(
        db,
        share["recipient_id"],
        user["id"],
        "share_revoked",
        share_id,
        share["resource_type"],
        share["resource_id"],
    )
    return None


@router.post("/shares/{share_id}/leave")
def leave_share(share_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    updated = db.execute(
        """UPDATE shares SET status = 'left', updated_at = ?
           WHERE id = ? AND recipient_id = ? AND status = 'accepted'""",
        (_now(), share_id, user["id"]),
    )
    if updated.rowcount != 1:
        raise HTTPException(404, "Accepted share not found")
    return {"shareId": share_id, "status": "left"}


@router.get("/shares/sent")
def list_sent_shares(user=Depends(get_current_user), db=Depends(get_db)):
    _expire_pending_requests(db)
    rows = db.execute(
        """SELECT s.id, s.resource_type, s.resource_id, s.status, s.created_at,
                  u.knoprix_id
           FROM shares s JOIN users u ON u.id = s.recipient_id
           WHERE s.sender_id = ? ORDER BY s.created_at DESC""",
        (user["id"],),
    ).fetchall()
    return {
        "shares": [
            {
                "shareId": row["id"],
                "resourceType": row["resource_type"],
                "resourceId": row["resource_id"],
                "status": row["status"],
                "createdAt": row["created_at"],
                "recipientKnoprixId": row["knoprix_id"],
            }
            for row in rows
        ]
    }


@router.get("/shares/received")
def list_received_shares(user=Depends(get_current_user), db=Depends(get_db)):
    _expire_pending_requests(db)
    rows = db.execute(
        """SELECT s.id, s.resource_type, s.status, s.created_at, s.updated_at,
                  u.knoprix_id
           FROM shares s JOIN users u ON u.id = s.sender_id
           WHERE s.recipient_id = ? ORDER BY s.created_at DESC""",
        (user["id"],),
    ).fetchall()
    return {
        "shares": [
            {
                "shareId": row["id"],
                "resourceType": row["resource_type"],
                "status": row["status"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
                "fromKnoprixId": row["knoprix_id"],
            }
            for row in rows
        ]
    }


@router.get("/shared-resources/{share_id}")
def get_shared_resource(
    share_id: str, user=Depends(get_current_user), db=Depends(get_db)
):
    share = db.execute(
        """SELECT sender_id, resource_type, resource_id FROM shares
           WHERE id = ? AND recipient_id = ? AND status = 'accepted'""",
        (share_id, user["id"]),
    ).fetchone()
    if (
        share is None
        or _blocked(db, user["id"], share["sender_id"])
        or not _is_contact(db, user["id"], share["sender_id"])
    ):
        raise HTTPException(404, "Shared resource not found")
    resource = _owned_shareable_resource(
        db, share["sender_id"], share["resource_type"], share["resource_id"]
    )
    resource = dict(resource)
    resource = {
        field: resource[field]
        for field in _shared_resource_fields(share["resource_type"])
    }
    return {
        "shareId": share_id,
        "resourceType": share["resource_type"],
        "resource": resource,
        "readOnly": True,
    }


def has_active_document_share(db, user_id: str, document_id: str) -> bool:
    row = db.execute(
        """SELECT 1 FROM shares s
           JOIN documents d ON d.id = s.resource_id
           JOIN projects p ON p.id = d.project_id AND p.user_id = s.sender_id
           JOIN contacts c ON
             (c.user_low = s.sender_id AND c.user_high = s.recipient_id)
             OR (c.user_high = s.sender_id AND c.user_low = s.recipient_id)
           WHERE s.recipient_id = ? AND s.resource_type = 'document'
             AND s.resource_id = ? AND s.status = 'accepted'
             AND NOT EXISTS (
               SELECT 1 FROM user_blocks b
               WHERE (b.blocker_id = s.sender_id AND b.blocked_id = s.recipient_id)
                  OR (b.blocker_id = s.recipient_id AND b.blocked_id = s.sender_id)
             )""",
        (user_id, document_id),
    ).fetchone()
    return row is not None


@router.put("/bookmarks/{bookmark_id}/highlight")
def link_highlight(
    bookmark_id: str,
    body: LinkHighlightBody,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    bookmark = db.execute(
        "SELECT document_id, page_number FROM bookmarks WHERE id = ? AND user_id = ?",
        (bookmark_id, user["id"]),
    ).fetchone()
    highlight = db.execute(
        "SELECT document_id, page_number FROM highlights WHERE id = ? AND user_id = ?",
        (body.highlightId, user["id"]),
    ).fetchone()
    if bookmark is None or highlight is None:
        raise HTTPException(404, "Bookmark or highlight not found")
    if (
        bookmark["document_id"] != highlight["document_id"]
        or bookmark["page_number"] != highlight["page_number"]
    ):
        raise HTTPException(422, "Linked bookmark and highlight must share a page")
    existing = db.execute(
        "SELECT bookmark_id FROM bookmark_highlight_links WHERE highlight_id = ?",
        (body.highlightId,),
    ).fetchone()
    if existing is not None and existing["bookmark_id"] != bookmark_id:
        raise HTTPException(409, "Highlight is already linked to another bookmark")
    db.execute(
        """INSERT INTO bookmark_highlight_links
           (bookmark_id, highlight_id, user_id, document_id, page_number)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(bookmark_id) DO UPDATE SET
             highlight_id = excluded.highlight_id,
             user_id = excluded.user_id,
             document_id = excluded.document_id,
             page_number = excluded.page_number""",
        (
            bookmark_id,
            body.highlightId,
            user["id"],
            bookmark["document_id"],
            bookmark["page_number"],
        ),
    )
    return {"bookmarkId": bookmark_id, "highlightId": body.highlightId}


@router.delete("/bookmarks/{bookmark_id}/highlight", status_code=status.HTTP_204_NO_CONTENT)
def unlink_highlight(
    bookmark_id: str, user=Depends(get_current_user), db=Depends(get_db)
):
    deleted = db.execute(
        """DELETE FROM bookmark_highlight_links
           WHERE bookmark_id = ? AND user_id = ?""",
        (bookmark_id, user["id"]),
    )
    if deleted.rowcount != 1:
        raise HTTPException(404, "Bookmark-highlight link not found")
    return None
