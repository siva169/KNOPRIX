import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Link2, LoaderCircle, LockKeyhole, Share2, ShieldBan, UserPlus, Users, X } from 'lucide-react';
import api from '../api';

const resourceLabel = (type) => ({
  document: 'Document',
  bookmark: 'Bookmark',
  highlight: 'Highlight',
}[type] || type);

export default function ContactsPage({ onClose, activeDocument, activeProject, openDocument, notify }) {
  const [profile, setProfile] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [sentContactRequests, setSentContactRequests] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [inbox, setInbox] = useState({ contactRequests: [], shareRequests: [] });
  const [sentShares, setSentShares] = useState([]);
  const [receivedShares, setReceivedShares] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [knoprixIdInput, setKnoprixIdInput] = useState('');
  const [lookupResult, setLookupResult] = useState('');
  const [resourceType, setResourceType] = useState('document');
  const [resourceId, setResourceId] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [shareDetail, setShareDetail] = useState(null);
  const [privacy, setPrivacy] = useState({
    allowIdLookup: true,
    allowContactRequests: true,
    emailNotificationsEnabled: false,
  });

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [profileResponse, contactsResponse, inboxResponse, contactOutboxResponse, sentResponse, receivedResponse, blocksResponse] =
        await Promise.all([
          api.get('/v1/profile'),
          api.get('/v1/contacts'),
          api.get('/v1/inbox'),
          api.get('/v1/contact-requests/sent'),
          api.get('/v1/shares/sent'),
          api.get('/v1/shares/received'),
          api.get('/v1/blocks'),
        ]);
      setProfile(profileResponse.data);
      setPrivacy({
        allowIdLookup: profileResponse.data.allowIdLookup,
        allowContactRequests: profileResponse.data.allowContactRequests,
        emailNotificationsEnabled: profileResponse.data.emailNotificationsEnabled,
      });
      setContacts(contactsResponse.data.contacts || []);
      setSentContactRequests(contactOutboxResponse.data.requests || []);
      setInbox(inboxResponse.data);
      setSentShares(sentResponse.data.shares || []);
      setReceivedShares(receivedResponse.data.shares || []);
      setBlocks(blocksResponse.data.blockedKnoprixIds || []);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Could not load contacts and sharing.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const loadResources = async () => {
      const [bookmarkResult, highlightResult] = await Promise.allSettled([
        activeProject && !activeDocument?.readOnly
          ? api.get(`/projects/${activeProject.id}/bookmarks`)
          : Promise.resolve({ data: { bookmarks: [] } }),
        activeDocument && !activeDocument.readOnly
          ? api.get(`/documents/${activeDocument.id}/highlights`)
          : Promise.resolve({ data: { highlights: [] } }),
      ]);
      if (cancelled) return;
      setBookmarks(bookmarkResult.status === 'fulfilled' ? bookmarkResult.value.data.bookmarks || [] : []);
      setHighlights(highlightResult.status === 'fulfilled' ? highlightResult.value.data.highlights || [] : []);
      if (bookmarkResult.status === 'rejected' || highlightResult.status === 'rejected') {
        setError('Some of your bookmarks or highlights could not be loaded for sharing.');
      }
    };
    void loadResources();
    return () => { cancelled = true; };
  }, [activeDocument, activeProject]);

  const resourceOptions = useMemo(() => {
    if (resourceType === 'document') {
      return activeDocument && !activeDocument.readOnly
        ? [{ id: activeDocument.id, label: activeDocument.file_name }]
        : [];
    }
    if (resourceType === 'bookmark') {
      return bookmarks.map((item) => ({
        id: item.id,
        label: item.name || item.highlighted_text || `Bookmark · page ${item.page_number}`,
      }));
    }
    return highlights.map((item) => ({
      id: item.id,
      label: `${item.text.slice(0, 70)} · page ${item.page_number}`,
    }));
  }, [activeDocument, bookmarks, highlights, resourceType]);

  useEffect(() => {
    setResourceId(resourceOptions[0]?.id || '');
  }, [resourceOptions]);

  const reportError = (requestError, fallback) => {
    const message = requestError.response?.data?.detail || fallback;
    setError(message);
    notify(message, 'error');
  };

  const lookup = async (event) => {
    event.preventDefault();
    const publicId = knoprixIdInput.trim().toUpperCase();
    setBusy('lookup');
    setLookupResult('');
    setError('');
    try {
      const { data } = await api.get(`/v1/contacts/lookup/${encodeURIComponent(publicId)}`);
      setLookupResult(data.knoprixId);
    } catch (requestError) {
      reportError(requestError, 'Knoprix ID not found or not discoverable.');
    } finally {
      setBusy('');
    }
  };

  const sendRequest = async (publicId) => {
    setBusy(`contact:${publicId}`);
    setError('');
    try {
      await api.post('/v1/contact-requests', { knoprixId: publicId });
      notify('Contact request sent in Knoprix', 'success');
      setLookupResult('');
      setKnoprixIdInput('');
      await refresh();
    } catch (requestError) {
      reportError(requestError, 'Could not send contact request.');
    } finally {
      setBusy('');
    }
  };

  const decideContact = async (requestId, action) => {
    setBusy(`request:${requestId}`);
    try {
      await api.post(`/v1/contact-requests/${requestId}/${action}`);
      notify(action === 'accept' ? 'Contact request accepted' : 'Contact request declined', 'success');
      await refresh();
    } catch (requestError) {
      reportError(requestError, 'Could not update contact request.');
    } finally {
      setBusy('');
    }
  };

  const removeContact = async (contact) => {
    if (!window.confirm(`Remove ${contact.knoprixId} from your contacts? Their accepted shares will also be revoked.`)) return;
    setBusy(`remove:${contact.knoprixId}`);
    try {
      await api.delete(`/v1/contacts/${contact.knoprixId}`);
      notify('Contact removed and their active shares revoked', 'success');
      await refresh();
    } catch (requestError) {
      reportError(requestError, 'Could not remove contact.');
    } finally {
      setBusy('');
    }
  };

  const blockContact = async (publicId) => {
    if (!window.confirm(`Block ${publicId}? This removes the contact and revokes pending and accepted shares.`)) return;
    setBusy(`block:${publicId}`);
    try {
      await api.post('/v1/blocks', { knoprixId: publicId });
      notify('User blocked; active shares revoked', 'success');
      setLookupResult('');
      await refresh();
    } catch (requestError) {
      reportError(requestError, 'Could not block user.');
    } finally {
      setBusy('');
    }
  };

  const unblock = async (publicId) => {
    setBusy(`unblock:${publicId}`);
    try {
      await api.delete(`/v1/blocks/${publicId}`);
      await refresh();
      notify('User unblocked', 'success');
    } catch (requestError) {
      reportError(requestError, 'Could not unblock user.');
    } finally {
      setBusy('');
    }
  };

  const decideShare = async (shareId, action) => {
    setBusy(`share:${shareId}`);
    try {
      await api.post(`/v1/shares/${shareId}/${action}`);
      notify(action === 'accept' ? 'Read-only share accepted' : 'Share declined', 'success');
      await refresh();
    } catch (requestError) {
      reportError(requestError, 'Could not update share request.');
    } finally {
      setBusy('');
    }
  };

  const openShared = async (shareId) => {
    setBusy(`open:${shareId}`);
    setShareDetail(null);
    try {
      const { data } = await api.get(`/v1/shared-resources/${shareId}`);
      if (data.resourceType === 'document') {
        const { data: documentData } = await api.get(`/documents/${data.resource.id}`);
        openDocument({ ...documentData.document, readOnly: true });
        onClose();
      } else {
        setShareDetail(data);
      }
    } catch (requestError) {
      reportError(requestError, 'This share is no longer available.');
      await refresh();
    } finally {
      setBusy('');
    }
  };

  const createShares = async (event) => {
    event.preventDefault();
    if (!resourceId || selectedRecipients.length === 0) return;
    setBusy('share-create');
    setError('');
    try {
      const { data } = await api.post('/v1/shares', {
        recipientKnoprixIds: selectedRecipients,
        resourceType,
        resourceId,
      });
      const created = data.shares.filter((item) => item.status === 'pending').length;
      notify(`${created} share request${created === 1 ? '' : 's'} sent`, created ? 'success' : 'info');
      setSelectedRecipients([]);
      await refresh();
    } catch (requestError) {
      reportError(requestError, 'Could not create share requests.');
    } finally {
      setBusy('');
    }
  };

  const revokeShare = async (shareId) => {
    if (!window.confirm('Revoke this share? The recipient will lose future access through Knoprix.')) return;
    setBusy(`revoke:${shareId}`);
    try {
      await api.delete(`/v1/shares/${shareId}`);
      await refresh();
      notify('Share revoked', 'success');
    } catch (requestError) {
      reportError(requestError, 'Could not revoke this share.');
    } finally {
      setBusy('');
    }
  };

  const leaveShare = async (shareId) => {
    if (!window.confirm('Remove this shared resource from your Knoprix access?')) return;
    setBusy(`leave:${shareId}`);
    try {
      await api.post(`/v1/shares/${shareId}/leave`);
      await refresh();
      notify('Shared access removed from your account', 'success');
    } catch (requestError) {
      reportError(requestError, 'Could not leave this share.');
    } finally {
      setBusy('');
    }
  };

  const savePrivacy = async (event) => {
    event.preventDefault();
    setBusy('privacy');
    try {
      const { data } = await api.patch('/v1/profile/privacy', privacy);
      setProfile(data);
      setPrivacy({
        allowIdLookup: data.allowIdLookup,
        allowContactRequests: data.allowContactRequests,
        emailNotificationsEnabled: data.emailNotificationsEnabled,
      });
      notify('Privacy settings saved', 'success');
    } catch (requestError) {
      reportError(requestError, 'Could not save privacy settings.');
    } finally {
      setBusy('');
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(profile.knoprixId);
      notify('Knoprix ID copied', 'success');
    } catch {
      notify('Clipboard access is unavailable; select and copy your ID.', 'error');
    }
  };

  const toggleRecipient = (publicId) => {
    setSelectedRecipients((selected) => selected.includes(publicId)
      ? selected.filter((value) => value !== publicId)
      : [...selected, publicId]);
  };

  return (
    <section className="flex-1 min-h-0 overflow-y-auto bg-midnight/60 px-3 py-4 sm:px-6 sm:py-6" aria-labelledby="contacts-heading">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-secondary/80 font-semibold">Knoprix network</p>
            <h1 id="contacts-heading" className="mt-1 text-2xl font-display font-bold text-ivory">Contacts & sharing</h1>
            <p className="mt-1 text-sm text-ivory/60">Contacts never get access to your resources unless you share and they accept.</p>
          </div>
          <button onClick={onClose} className="min-h-11 min-w-11 grid place-items-center rounded-xl border border-glass-borderDark text-ivory/70 hover:text-ivory" aria-label="Close contacts">
            <X className="size-4" />
          </button>
        </div>

        {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
        {loading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-ivory/60" role="status">
            <LoaderCircle className="size-4 animate-spin" /> Loading contacts…
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="glass-panel rounded-2xl p-4 sm:p-5">
                <h2 className="flex items-center gap-2 font-semibold text-ivory"><Users className="size-4 text-secondary" /> Your Knoprix ID</h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="rounded-lg border border-glass-borderDark bg-black/20 px-3 py-2 text-sm tracking-wider text-secondary">{profile?.knoprixId}</code>
                  <button onClick={copyId} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-glass-borderDark px-3 text-xs text-ivory/80 hover:text-secondary">
                    <Copy className="size-3.5" /> Copy ID
                  </button>
                </div>
                <form onSubmit={lookup} className="mt-5 space-y-2">
                  <label htmlFor="knoprix-contact-id" className="block text-xs font-medium text-ivory/70">Find someone by Knoprix ID</label>
                  <div className="flex gap-2">
                    <input
                      id="knoprix-contact-id"
                      value={knoprixIdInput}
                      onChange={(event) => setKnoprixIdInput(event.target.value)}
                      placeholder="KP-XXXXXXXXXX"
                      maxLength={13}
                      autoCapitalize="characters"
                      className="min-w-0 flex-1 rounded-xl border border-glass-borderDark bg-midnight-deep/80 px-3 py-2.5 text-sm text-ivory placeholder:text-ivory/35 focus:border-secondary focus:outline-none"
                    />
                    <button disabled={busy === 'lookup' || !knoprixIdInput.trim()} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
                      {busy === 'lookup' ? 'Searching…' : 'Find'}
                    </button>
                  </div>
                </form>
                {lookupResult && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-secondary/20 bg-secondary/5 p-3">
                    <span className="text-sm text-ivory">{lookupResult}</span>
                    <div className="flex gap-2">
                      <button disabled={busy === `contact:${lookupResult}`} onClick={() => sendRequest(lookupResult)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white">
                        <UserPlus className="size-3.5" /> Request
                      </button>
                      <button onClick={() => blockContact(lookupResult)} className="min-h-10 rounded-lg border border-rose-400/30 px-3 text-xs text-rose-200">Block</button>
                    </div>
                  </div>
                )}
              </section>

              <form onSubmit={savePrivacy} className="glass-panel rounded-2xl p-4 sm:p-5">
                <h2 className="flex items-center gap-2 font-semibold text-ivory"><LockKeyhole className="size-4 text-secondary" /> Privacy & notifications</h2>
                <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-ivory/80">
                  <input type="checkbox" checked={privacy.allowIdLookup} onChange={(event) => setPrivacy({ ...privacy, allowIdLookup: event.target.checked })} className="mt-1 accent-amber-400" />
                  <span><strong className="block font-medium text-ivory">Allow Knoprix ID lookup</strong><span className="text-xs text-ivory/50">People with your ID can find you and request contact.</span></span>
                </label>
                <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-ivory/80">
                  <input type="checkbox" checked={privacy.allowContactRequests} onChange={(event) => setPrivacy({ ...privacy, allowContactRequests: event.target.checked })} className="mt-1 accent-amber-400" />
                  <span><strong className="block font-medium text-ivory">Allow contact requests</strong><span className="text-xs text-ivory/50">Turn off to prevent new requests even if your ID is known.</span></span>
                </label>
                <label className="mt-3 flex cursor-not-allowed items-start gap-3 text-sm text-ivory/50">
                  <input type="checkbox" disabled checked={privacy.emailNotificationsEnabled} className="mt-1 accent-amber-400" />
                  <span><strong className="block font-medium">Email request notifications (unavailable)</strong><span className="text-xs">Email delivery is not configured; requests remain available in Knoprix.</span></span>
                </label>
                <button disabled={busy === 'privacy'} className="mt-4 min-h-10 rounded-xl border border-secondary/30 px-4 text-xs font-semibold text-secondary disabled:opacity-50">
                  {busy === 'privacy' ? 'Saving…' : 'Save privacy settings'}
                </button>
              </form>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="glass-panel rounded-2xl p-4 sm:p-5">
                <h2 className="flex items-center gap-2 font-semibold text-ivory"><UserPlus className="size-4 text-secondary" /> Incoming contact requests</h2>
                {inbox.contactRequests.length === 0 ? <p className="mt-3 text-sm text-ivory/50">No pending contact requests.</p> : (
                  <ul className="mt-3 divide-y divide-white/10">
                    {inbox.contactRequests.map((request) => (
                      <li key={request.requestId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <span className="text-sm text-ivory">{request.fromKnoprixId}</span>
                        <div className="flex gap-2">
                          <button disabled={busy === `request:${request.requestId}`} onClick={() => decideContact(request.requestId, 'accept')} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-white"><Check className="size-3.5" /> Accept</button>
                          <button disabled={busy === `request:${request.requestId}`} onClick={() => decideContact(request.requestId, 'decline')} className="min-h-10 rounded-lg border border-glass-borderDark px-3 text-xs text-ivory/70">Decline</button>
                          <button disabled={busy === `block:${request.fromKnoprixId}`} onClick={() => blockContact(request.fromKnoprixId)} aria-label={`Block ${request.fromKnoprixId}`} className="grid min-h-10 min-w-10 place-items-center rounded-lg border border-rose-400/30 text-rose-200"><ShieldBan className="size-4" /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="glass-panel rounded-2xl p-4 sm:p-5">
                <h2 className="font-semibold text-ivory">Sent contact requests</h2>
                {sentContactRequests.length === 0 ? <p className="mt-3 text-sm text-ivory/50">No outgoing contact requests.</p> : (
                  <ul className="mt-3 divide-y divide-white/10">
                    {sentContactRequests.map((request) => (
                      <li key={request.requestId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <span className="text-sm text-ivory">{request.toKnoprixId}<span className="ml-2 text-xs text-ivory/50">{request.status}</span></span>
                        {request.status === 'pending' && <button onClick={async () => {
                          setBusy(`cancel:${request.requestId}`);
                          try {
                            await api.delete(`/v1/contact-requests/${request.requestId}`);
                            await refresh();
                            notify('Contact request canceled', 'success');
                          } catch (requestError) {
                            reportError(requestError, 'Could not cancel contact request.');
                          } finally {
                            setBusy('');
                          }
                        }} disabled={busy === `cancel:${request.requestId}`} className="min-h-10 rounded-lg border border-glass-borderDark px-3 text-xs text-ivory/70">Cancel</button>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="glass-panel rounded-2xl p-4 sm:p-5">
                <h2 className="flex items-center gap-2 font-semibold text-ivory"><Users className="size-4 text-secondary" /> Your contacts <span className="text-xs text-ivory/40">({contacts.length})</span></h2>
                {contacts.length === 0 ? <p className="mt-3 text-sm text-ivory/50">Accepted contacts will appear here.</p> : (
                  <ul className="mt-3 divide-y divide-white/10">
                    {contacts.map((contact) => (
                      <li key={contact.contactId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <span className="min-w-0"><strong className="block truncate text-sm text-ivory">{contact.fullName}</strong><code className="text-xs text-ivory/50">{contact.knoprixId}</code></span>
                        <div className="flex gap-2">
                          <button disabled={busy === `remove:${contact.knoprixId}`} onClick={() => removeContact(contact)} className="min-h-10 rounded-lg border border-glass-borderDark px-3 text-xs text-ivory/70">Remove</button>
                          <button disabled={busy === `block:${contact.knoprixId}`} onClick={() => blockContact(contact.knoprixId)} aria-label={`Block ${contact.knoprixId}`} className="grid min-h-10 min-w-10 place-items-center rounded-lg border border-rose-400/30 text-rose-200"><ShieldBan className="size-4" /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="glass-panel rounded-2xl p-4 sm:p-5">
              <h2 className="flex items-center gap-2 font-semibold text-ivory"><Share2 className="size-4 text-secondary" /> Share a resource read-only</h2>
              <p className="mt-1 text-xs text-ivory/50">Each contact must accept separately. Sharing one item does not share its project or collection.</p>
              <form onSubmit={createShares} className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-ivory/70">Resource type
                    <select value={resourceType} onChange={(event) => setResourceType(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-glass-borderDark bg-midnight-deep px-3 text-sm text-ivory">
                      <option value="document">Document</option>
                      <option value="bookmark">Bookmark</option>
                      <option value="highlight">Highlight</option>
                    </select>
                  </label>
                  <label className="text-xs text-ivory/70">Resource
                    <select value={resourceId} onChange={(event) => setResourceId(event.target.value)} disabled={!resourceOptions.length} className="mt-1 block min-h-11 w-full rounded-xl border border-glass-borderDark bg-midnight-deep px-3 text-sm text-ivory disabled:opacity-50">
                      {resourceOptions.length ? resourceOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>) : <option value="">No eligible resource in current workspace</option>}
                    </select>
                  </label>
                </div>
                {contacts.length === 0 ? <p className="text-sm text-ivory/50">Add a contact before sharing.</p> : (
                  <fieldset>
                    <legend className="text-xs font-medium text-ivory/70">Recipients</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {contacts.map((contact) => (
                        <label key={contact.contactId} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-glass-borderDark px-3 text-sm text-ivory/80">
                          <input type="checkbox" checked={selectedRecipients.includes(contact.knoprixId)} onChange={() => toggleRecipient(contact.knoprixId)} className="accent-amber-400" />
                          <span className="truncate">{contact.knoprixId}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <button disabled={busy === 'share-create' || !resourceId || !selectedRecipients.length} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
                  <Link2 className="size-4" /> {busy === 'share-create' ? 'Sending…' : 'Send share requests'}
                </button>
              </form>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="glass-panel rounded-2xl p-4 sm:p-5">
                <h2 className="font-semibold text-ivory">Incoming shares</h2>
                {receivedShares.length === 0 ? <p className="mt-3 text-sm text-ivory/50">No shared resources yet.</p> : (
                  <ul className="mt-3 divide-y divide-white/10">
                    {receivedShares.map((share) => (
                      <li key={share.shareId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <span><strong className="block text-sm text-ivory">{resourceLabel(share.resourceType)}</strong><span className="text-xs text-ivory/50">{share.fromKnoprixId} · {share.status}</span></span>
                        <div className="flex gap-2">
                          {share.status === 'pending' && <><button disabled={busy === `share:${share.shareId}`} onClick={() => decideShare(share.shareId, 'accept')} className="min-h-10 rounded-lg bg-primary px-3 text-xs font-semibold text-white">Accept</button><button disabled={busy === `share:${share.shareId}`} onClick={() => decideShare(share.shareId, 'decline')} className="min-h-10 rounded-lg border border-glass-borderDark px-3 text-xs text-ivory/70">Decline</button></>}
                          {share.status === 'accepted' && <><button disabled={busy === `open:${share.shareId}`} onClick={() => openShared(share.shareId)} className="min-h-10 rounded-lg border border-secondary/30 px-3 text-xs font-semibold text-secondary">View read-only</button><button disabled={busy === `leave:${share.shareId}`} onClick={() => leaveShare(share.shareId)} className="min-h-10 rounded-lg border border-glass-borderDark px-3 text-xs text-ivory/70">Remove access</button></>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="glass-panel rounded-2xl p-4 sm:p-5">
                <h2 className="font-semibold text-ivory">Sent shares</h2>
                {sentShares.length === 0 ? <p className="mt-3 text-sm text-ivory/50">You have not shared any resources.</p> : (
                  <ul className="mt-3 divide-y divide-white/10">
                    {sentShares.map((share) => (
                      <li key={share.shareId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <span><strong className="block text-sm text-ivory">{resourceLabel(share.resourceType)}</strong><span className="text-xs text-ivory/50">{share.recipientKnoprixId} · {share.status}</span></span>
                        {['pending', 'accepted'].includes(share.status) && <button disabled={busy === `revoke:${share.shareId}`} onClick={() => revokeShare(share.shareId)} className="min-h-10 rounded-lg border border-rose-400/30 px-3 text-xs text-rose-200">Revoke</button>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="glass-panel rounded-2xl p-4 sm:p-5">
              <h2 className="font-semibold text-ivory">Blocked IDs</h2>
              {blocks.length === 0 ? <p className="mt-2 text-sm text-ivory/50">No blocked users.</p> : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {blocks.map((id) => <li key={id} className="flex items-center gap-2 rounded-xl border border-glass-borderDark px-3 py-2 text-xs text-ivory/70"><span>{id}</span><button disabled={busy === `unblock:${id}`} onClick={() => unblock(id)} className="text-secondary underline underline-offset-2">Unblock</button></li>)}
                </ul>
              )}
            </section>

            {shareDetail && (
              <section className="glass-panel rounded-2xl p-4 sm:p-5" aria-live="polite">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-ivory">Read-only {resourceLabel(shareDetail.resourceType).toLowerCase()}</h2>
                  <button onClick={() => setShareDetail(null)} className="text-xs text-ivory/60 underline">Close</button>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ivory/80">
                  {shareDetail.resource.text || shareDetail.resource.highlighted_text || shareDetail.resource.notes || shareDetail.resource.name || 'Shared bookmark'}
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </section>
  );
}
