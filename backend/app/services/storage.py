"""Document storage backends.

Local disk remains the default for development. Production deployments can
use any S3-compatible object store, including Supabase Storage.
"""
from pathlib import Path
import re

from ..config import cfg


def enabled() -> bool:
    return cfg.OBJECT_STORAGE_ENABLED


def _client():
    if not enabled():
        raise RuntimeError("Object storage is not configured")
    import boto3
    from botocore.config import Config as BotoConfig

    return boto3.client(
        "s3",
        endpoint_url=cfg.OBJECT_STORAGE_ENDPOINT,
        aws_access_key_id=cfg.OBJECT_STORAGE_ACCESS_KEY,
        aws_secret_access_key=cfg.OBJECT_STORAGE_SECRET_KEY,
        region_name=_region(),
        config=BotoConfig(
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
            s3={
                "addressing_style": "path",
                "payload_signing_enabled": False,
            },
            signature_version="s3v4",
        ),
    )


def _region() -> str:
    """Accept the actual region or recover it from a pasted pooler hostname."""
    value = cfg.OBJECT_STORAGE_REGION.strip()
    match = re.search(r"\b((?:us|eu|ap|ca|sa|me|af|il|mx)-[a-z0-9-]+)\b", value)
    return match.group(1) if match else value


def object_key(document_id: str, file_name: str) -> str:
    return f"documents/{document_id}/{Path(file_name).name}"


def upload(path: Path, key: str, content_type: str | None = None) -> None:
    extra = {"ContentType": content_type} if content_type else {}
    with path.open("rb") as source:
        _client().put_object(
            Bucket=cfg.OBJECT_STORAGE_BUCKET,
            Key=key,
            Body=source,
            ContentLength=path.stat().st_size,
            **extra,
        )


def download(key: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    _client().download_file(cfg.OBJECT_STORAGE_BUCKET, key, str(destination))


def delete(key: str) -> None:
    _client().delete_object(Bucket=cfg.OBJECT_STORAGE_BUCKET, Key=key)


def stream(key: str):
    return _client().get_object(
        Bucket=cfg.OBJECT_STORAGE_BUCKET,
        Key=key,
    )["Body"]
