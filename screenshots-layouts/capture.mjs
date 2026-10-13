import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:5173';
const output = path.dirname(fileURLToPath(import.meta.url));
const widths = [390, 425, 768, 1024];
const height = 900;
const previewEmail = 'preview@example.invalid';
const projectId = 'project-research';
const documentId = 'document-research';
const slideDocumentId = 'document-slides';
const pdfDocumentId = 'document-pdf';
const pdfFallbackDocumentId = 'document-pdf-fallback';

const researchText = [
  'A durable research practice turns scattered reading into connected knowledge.',
  'Signal processing offers a useful example: the same concept appears across data, systems, and human perception.',
  'A clear index makes those connections easier to find, revisit, and explain.',
  'Good notes preserve the source, the page, and the reason a passage mattered.',
  'The reading desk brings those small decisions together in one calm workspace.',
].join('\n\n');

const documents = [
  {
    id: documentId,
    project_id: projectId,
    file_name: 'Research Brief.txt',
    file_type: 'txt',
    page_count: 1,
    created_at: '2026-10-12T10:00:00Z',
    extracted_text: researchText,
  },
  {
    id: slideDocumentId,
    project_id: projectId,
    file_name: 'Signal Systems.pptx',
    file_type: 'pptx',
    page_count: 3,
    created_at: '2026-10-11T10:00:00Z',
    extracted_text: 'Signal Systems\nPatterns across data and perception.',
  },
  {
    id: pdfDocumentId,
    project_id: projectId,
    file_name: 'Applied Index.pdf',
    file_type: 'pdf',
    page_count: 3,
    created_at: '2026-10-10T10:00:00Z',
    extracted_text: 'Applied Index\n\nPDF source preview for this local screenshot run.\n\nSearchable text remains readable if the original file is unavailable.',
  },
  {
    id: pdfFallbackDocumentId,
    project_id: projectId,
    file_name: 'Text Fallback.pdf',
    file_type: 'pdf',
    page_count: 2,
    created_at: '2026-10-09T10:00:00Z',
    extracted_text: 'Text Fallback\n\nThis synthetic PDF has no binary in the preview fixture.\n\nThe extracted text remains available even when the original file cannot be rendered.',
  },
];

const projects = [
  { id: projectId, name: 'Research Library', file_count: 4 },
  { id: 'project-notes', name: 'Field Notes', file_count: 1 },
];

const highlights = [
  {
    id: 'highlight-seed',
    document_id: documentId,
    page_number: 1,
    text: 'connected knowledge',
    color: 'yellow',
    match_all: false,
  },
];

const bookmarks = [
  {
    id: 'bookmark-seed-1',
    project_id: projectId,
    document_id: documentId,
    file_name: 'Research Brief.txt',
    page_number: 1,
    bookmark_type: 'text',
    name: 'Connected knowledge',
    highlighted_text: 'A durable research practice turns scattered reading into connected knowledge.',
    notes: 'Revisit when mapping sources.',
    linked_highlight_id: 'highlight-seed',
    anchor_start: 0,
    anchor_end: 78,
  },
  {
    id: 'bookmark-seed-2',
    project_id: projectId,
    document_id: slideDocumentId,
    file_name: 'Signal Systems.pptx',
    page_number: 2,
    bookmark_type: 'page',
    name: 'Reading workflow',
    highlighted_text: '',
    notes: '',
    linked_highlight_id: null,
    anchor_start: null,
    anchor_end: null,
  },
  {
    id: 'bookmark-seed-3',
    project_id: projectId,
    document_id: documentId,
    file_name: 'Signal Systems.pptx',
    page_number: 2,
    bookmark_type: 'text',
    name: 'Signal patterns',
    highlighted_text: 'The same concept appears across data, systems, and human perception.',
    notes: 'Shared vocabulary across disciplines.',
    linked_highlight_id: null,
    anchor_start: null,
    anchor_end: null,
  },
];

const projectList = [...projects];
const bookmarkList = [...bookmarks];
const highlightList = [...highlights];
const blockedExternalRequests = [];
const unmappedApiRequests = [];
const pageErrors = [];
const captures = [];
const projectReadProbe = { enabled: false, failBookmarksNext: false, requests: [] };
const bookmarkDeleteProbe = { failNext: false, lastStartedAt: null };
const shareRefreshProbe = { enabled: false, requests: [] };
const shareCreateProbe = { failNext: false, startedAt: null };
let nextId = 1;
let pinnedWords = ['signal'];

const response = (route, data, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(data),
});

const ok = (route, data = { ok: true }, status = 200) => response(route, data, status);

const slideShapes = (title, subtitle, color = 'F4F1E8') => ({
  bg: color,
  shapes: [
    {
      type: 'text',
      x: 8,
      y: 12,
      w: 78,
      h: 18,
      paras: [{ align: 'left', runs: [{ t: title, size: 34, bold: true, color: '262626' }] }],
    },
    {
      type: 'text',
      x: 8,
      y: 36,
      w: 72,
      h: 24,
      paras: [{ align: 'left', runs: [{ t: subtitle, size: 20, color: '514B40' }] }],
    },
  ],
});

const graph = () => ({
  nodes: [
    {
      id: 'concept-signal',
      label: 'signal',
      docCount: 2,
      pinned: pinnedWords.includes('signal'),
      documents: [{
        documentId,
        fileName: 'Research Brief.txt',
        pages: [1],
        evidence: [{ page: 1, excerpt: 'Signal processing offers a useful example across data, systems, and perception.' }],
      }],
    },
    {
      id: 'concept-index',
      label: 'index',
      docCount: 1,
      pinned: pinnedWords.includes('index'),
      documents: [{
        documentId,
        fileName: 'Research Brief.txt',
        pages: [1],
        evidence: [{ page: 1, excerpt: 'A clear index makes connections easier to find and revisit.' }],
      }],
    },
    {
      id: 'concept-reading',
      label: 'reading',
      docCount: 2,
      pinned: pinnedWords.includes('reading'),
      documents: [{
        documentId: slideDocumentId,
        fileName: 'Signal Systems.pptx',
        pages: [1, 2],
        evidence: [{ page: 2, excerpt: 'Reading across sources reveals repeated concepts.' }],
      }],
    },
  ],
  edges: [
    { a: 'concept-signal', b: 'concept-index', strength: 0.75 },
    { a: 'concept-index', b: 'concept-reading', strength: 0.55 },
    { a: 'concept-reading', b: 'concept-signal', strength: 0.85 },
  ],
  pinned: pinnedWords,
});

const createPdfFixture = () => {
  const pageTexts = [
    ['Applied Index', 'Research connections are easier to navigate with a clear index.'],
    ['Follow the signal', 'Compare concepts across data, systems, and perception.'],
    ['Return to the source', 'Keep each idea connected to its passage and page.'],
  ];
  const streamFor = ([title, text]) => [
    'BT',
    '/F1 24 Tf',
    '72 720 Td',
    `(${title}) Tj`,
    '0 -42 Td',
    '/F1 14 Tf',
    `(${text}) Tj`,
    'ET',
  ].join('\n');
  const streams = pageTexts.map(streamFor);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R >> >> /Contents 8 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R >> >> /Contents 9 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...streams.map((stream) => `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`),
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += `${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
};

const pdfFixture = createPdfFixture();

const apiRoute = async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname.replace(/^\/api/, '');
  const method = request.method();
  const shareRefreshPaths = [
    '/v1/profile',
    '/v1/contacts',
    '/v1/inbox',
    '/v1/contact-requests/sent',
    '/v1/shares/sent',
    '/v1/shares/received',
    '/v1/blocks',
  ];
  if (
    shareRefreshProbe.enabled &&
    method === 'GET' &&
    shareRefreshPaths.includes(pathname)
  ) {
    shareRefreshProbe.requests.push(pathname);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  if (pathname === '/auth/refresh') {
    return response(route, { detail: 'No preview session' }, 401);
  }
  if (pathname === '/auth/firebase/session' || pathname === '/auth/me') {
    return ok(route, {
      id: 'preview-user',
      email: previewEmail,
      full_name: 'Avery Demo',
      knoprixId: 'KP-DEMO000001',
    });
  }
  if (pathname === '/auth/logout' || pathname === '/auth/logout-cookie') return ok(route);
  if (pathname === '/projects' && method === 'GET') {
    return ok(route, { projects: projectList });
  }
  if (pathname === '/projects' && method === 'POST') {
    const body = request.postDataJSON();
    const project = { id: `project-created-${nextId++}`, name: body.name, file_count: 0 };
    projectList.unshift(project);
    return ok(route, { project }, 201);
  }
  if (/^\/projects\/[^/]+\/documents$/.test(pathname) && method === 'GET') {
    const id = pathname.split('/')[2];
    if (projectReadProbe.enabled && id === projectId) {
      projectReadProbe.requests.push({ path: 'documents', startedAt: Date.now() });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return ok(route, { documents: id === projectId ? documents : [] });
  }
  if (/^\/projects\/[^/]+\/bookmarks$/.test(pathname) && method === 'GET') {
    const query = (url.searchParams.get('q') || '').toLowerCase();
    const id = pathname.split('/')[2];
    if (projectReadProbe.enabled && id === projectId && !query) {
      projectReadProbe.requests.push({ path: 'bookmarks', startedAt: Date.now() });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    if (projectReadProbe.failBookmarksNext && id === projectId && !query) {
      projectReadProbe.failBookmarksNext = false;
      return ok(route, { detail: 'Synthetic bookmark load failure' }, 503);
    }
    const list = id === projectId ? bookmarkList : [];
    return ok(route, {
      bookmarks: query
        ? list.filter((item) => `${item.name} ${item.highlighted_text} ${item.notes}`.toLowerCase().includes(query))
        : list,
    });
  }
  if (pathname === '/autocomplete' && method === 'GET') {
    return ok(route, {
      suggestions: [
        {
          word: 'signal',
          frequency: 12,
          locations: [{ documentId, fileName: 'Research Brief.txt', pages: [1] }],
        },
        {
          word: 'signals',
          frequency: 7,
          locations: [{ documentId, fileName: 'Research Brief.txt', pages: [1] }],
        },
        {
          word: 'signature',
          frequency: 4,
          locations: [{ documentId: 'document-notes', fileName: 'Field Notes.txt', pages: [1] }],
        },
      ],
    });
  }
  if (pathname === '/search' && method === 'GET') {
    return ok(route, {
      results: [{
        documentId,
        fileName: 'Research Brief.txt',
        score: 0.94,
        pages: [1],
        snippet: 'Signal processing offers a useful example: the same concept appears across data, systems, and human perception.',
      }],
    });
  }
  if (/^\/documents\/[^/]+$/.test(pathname) && method === 'GET') {
    const doc = documents.find((item) => item.id === pathname.split('/')[2]);
    return doc ? ok(route, { document: doc }) : response(route, { detail: 'Not found' }, 404);
  }
  if (/^\/documents\/[^/]+\/stream$/.test(pathname)) {
    if (pathname.split('/')[2] === pdfFallbackDocumentId) {
      return response(route, { detail: 'Synthetic preview has no PDF binary' }, 404);
    }
    return route.fulfill({ status: 200, contentType: 'application/pdf', body: pdfFixture });
  }
  if (/^\/documents\/[^/]+\/slides$/.test(pathname)) {
    return ok(route, {
      widthPt: 960,
      heightPt: 540,
      slides: [
        slideShapes('Signal Systems', 'A visual guide to connected research.'),
        slideShapes('Patterns across sources', 'Compare data, systems, and human perception.', 'E9E2D0'),
        slideShapes('Keep the source close', 'Track the concept, passage, and page.', 'DCE8E3'),
      ],
    });
  }
  if (/^\/documents\/[^/]+\/highlights$/.test(pathname) && method === 'GET') {
    const id = pathname.split('/')[2];
    return ok(route, { highlights: id === documentId ? highlightList : [] });
  }
  if (pathname === '/highlights' && method === 'POST') {
    const body = request.postDataJSON();
    const item = {
      id: `highlight-${nextId++}`,
      document_id: body.documentId,
      page_number: body.pageNumber,
      text: body.text,
      color: body.color,
      match_all: body.matchAll,
    };
    highlightList.push(item);
    return ok(route, { id: item.id }, 201);
  }
  if (/^\/highlights\/[^/]+$/.test(pathname) && method === 'DELETE') {
    return ok(route);
  }
  if (/^\/bookmarks\/[^/]+$/.test(pathname) && method === 'DELETE') {
    bookmarkDeleteProbe.lastStartedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (bookmarkDeleteProbe.failNext) {
      bookmarkDeleteProbe.failNext = false;
      return response(route, { detail: 'Synthetic delete failure' }, 503);
    }
    const bookmarkId = pathname.split('/').at(-1);
    const bookmarkIndex = bookmarkList.findIndex((item) => item.id === bookmarkId);
    if (bookmarkIndex !== -1) bookmarkList.splice(bookmarkIndex, 1);
    return ok(route);
  }
  if (/^\/bookmarks\/[^/]+$/.test(pathname) && method === 'PATCH') return ok(route);
  if (pathname === '/bookmarks' && method === 'POST') {
    const body = request.postDataJSON();
    const item = {
      id: `bookmark-created-${nextId++}`,
      project_id: body.projectId,
      document_id: body.documentId,
      file_name: documents.find((doc) => doc.id === body.documentId)?.file_name || 'Research Brief.txt',
      page_number: body.pageNumber,
      bookmark_type: body.bookmarkType,
      name: body.name || '',
      highlighted_text: body.highlightedText || '',
      notes: body.notes || '',
      linked_highlight_id: null,
      anchor_start: body.selectionStart ?? null,
      anchor_end: body.selectionEnd ?? null,
    };
    bookmarkList.unshift(item);
    return ok(route, item, 201);
  }
  if (/^\/projects\/[^/]+\/graph$/.test(pathname) && method === 'GET') return ok(route, graph());
  if (/^\/projects\/[^/]+\/pins$/.test(pathname) && method === 'POST') {
    const word = request.postDataJSON().word;
    pinnedWords = [...new Set([...pinnedWords, word])];
    return ok(route);
  }
  if (/^\/projects\/[^/]+\/pins\//.test(pathname) && method === 'DELETE') {
    const word = decodeURIComponent(pathname.split('/').at(-1));
    pinnedWords = pinnedWords.filter((item) => item !== word);
    return ok(route);
  }
  if (/^\/projects\/[^/]+\/dsa\/stats$/.test(pathname)) {
    return ok(route, {
      stats: {
        trie: { totalKeywords: 1842 },
        invertedIndex: { totalMappings: 6235 },
        bookmarkCollection: { totalBookmarks: bookmarkList.length, topPage: 1, topText: 'connected knowledge' },
      },
    });
  }
  if (/^\/projects\/[^/]+\/dsa\/top-keywords$/.test(pathname)) {
    return ok(route, {
      keywords: [
        { word: 'signal', frequency: 12 },
        { word: 'research', frequency: 10 },
        { word: 'index', frequency: 8 },
        { word: 'reading', frequency: 7 },
        { word: 'systems', frequency: 5 },
      ],
    });
  }
  if (/^\/projects\/[^/]+\/dsa\/top-passages$/.test(pathname)) {
    return ok(route, {
      considered: 24,
      passages: [
        { documentId, fileName: 'Research Brief.txt', score: 0.94, pageNumber: 1, excerpt: 'Signal processing offers a useful example across data and systems.' },
        { documentId: slideDocumentId, fileName: 'Signal Systems.pptx', score: 0.82, pageNumber: 2, excerpt: 'Compare patterns across sources.' },
        { documentId: pdfDocumentId, fileName: 'Applied Index.pdf', score: 0.71, pageNumber: 1, excerpt: 'A clear index makes connections easier to revisit.' },
      ],
    });
  }
  if (/^\/projects\/[^/]+\/dsa\/rebuild$/.test(pathname) && method === 'POST') return ok(route);
  if (pathname === '/providers/allowlist') {
    return ok(route, {
      providers: [
        { id: 'groq-free', name: 'Groq · Free tier', baseUrl: 'https://api.groq.com/openai/v1', models: [{ id: 'llama-3.1-8b', label: 'Llama 3.1 8B' }] },
        { id: 'openrouter-free', name: 'OpenRouter · Free tier', baseUrl: 'https://openrouter.ai/api/v1', models: [{ id: 'qwen-free', label: 'Qwen · Free' }] },
      ],
    });
  }
  if (/^\/documents\/[^/]+\/summary$/.test(pathname) && method === 'POST') {
    return ok(route, {
      sentenceCount: 3,
      summary: [
        'A durable research practice turns scattered reading into connected knowledge.',
        'A clear index makes connections easier to find, revisit, and explain.',
        'Good notes preserve the source, page, and reason a passage mattered.',
      ],
    });
  }
  if (pathname === '/chat/ask' && method === 'POST') {
    return ok(route, {
      answer: 'The notes use signal processing to show how one idea can connect data, systems, and human perception.',
      citations: [{
        documentId,
        fileName: 'Research Brief.txt',
        pageNumber: 1,
        excerpt: 'Signal processing offers a useful example: the same concept appears across data, systems, and human perception.',
      }],
    });
  }
  if (/^\/projects\/[^/]+\/documents\/upload$/.test(pathname)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const uploaded = {
      id: `document-upload-${nextId++}`,
      project_id: projectId,
      file_name: 'Demo field notes.txt',
      file_type: 'txt',
      page_count: 1,
      created_at: new Date().toISOString(),
      extracted_text: 'Synthetic upload fixture.',
    };
    if (pathname.split('/')[2] === projectId) {
      documents.push(uploaded);
      projectList.find((project) => project.id === projectId).file_count = documents.length;
    }
    return ok(route, { document: uploaded }, 201);
  }
  if (pathname === '/v1/profile' && method === 'GET') {
    return ok(route, {
      knoprixId: 'KP-DEMO000001',
      fullName: 'Avery Demo',
      allowIdLookup: true,
      allowContactRequests: true,
      emailNotificationsEnabled: false,
    });
  }
  if (pathname === '/v1/profile/privacy' && method === 'PATCH') {
    return ok(route, {
      knoprixId: 'KP-DEMO000001',
      fullName: 'Avery Demo',
      ...request.postDataJSON(),
    });
  }
  if (pathname === '/v1/contacts' && method === 'GET') {
    return ok(route, {
      contacts: [
        { contactId: 'contact-1', fullName: 'Morgan Lee', knoprixId: 'KP-MORGA000001' },
        { contactId: 'contact-2', fullName: 'Jordan Park', knoprixId: 'KP-JORDA000002' },
      ],
    });
  }
  if (/^\/v1\/contacts\/lookup\//.test(pathname)) {
    return ok(route, { knoprixId: decodeURIComponent(pathname.split('/').at(-1)) });
  }
  if (pathname === '/v1/inbox') {
    return ok(route, {
      contactRequests: [
        { requestId: 'request-in-1', fromKnoprixId: 'KP-TAYLO000003' },
      ],
      shareRequests: [],
    });
  }
  if (pathname === '/v1/contact-requests/sent') {
    return ok(route, {
      requests: [{ requestId: 'request-out-1', toKnoprixId: 'KP-RIVER00004', status: 'pending' }],
    });
  }
  if (pathname === '/v1/shares/sent') {
    return ok(route, {
      shares: [
        { shareId: 'share-out-1', resourceType: 'document', recipientKnoprixId: 'KP-MORGA000001', status: 'pending' },
        { shareId: 'share-out-2', resourceType: 'bookmark', recipientKnoprixId: 'KP-JORDA000002', status: 'accepted' },
      ],
    });
  }
  if (pathname === '/v1/shares/received') {
    return ok(route, {
      shares: [
        { shareId: 'share-in-1', resourceType: 'document', fromKnoprixId: 'KP-TAYLO000003', status: 'pending' },
        { shareId: 'share-in-2', resourceType: 'bookmark', fromKnoprixId: 'KP-CASEY000005', status: 'accepted' },
      ],
    });
  }
  if (pathname === '/v1/blocks') return ok(route, { blockedKnoprixIds: ['KP-QUIET000006'] });
  if (pathname === '/v1/shared-resources/share-in-2') {
    return ok(route, { resourceType: 'bookmark', resource: { name: 'Shared reading cue', text: 'A source-linked note shared as a read-only preview.' } });
  }
  if (pathname === '/v1/shares' && method === 'POST') {
    shareCreateProbe.startedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (shareCreateProbe.failNext) {
      shareCreateProbe.failNext = false;
      return response(route, { detail: 'Synthetic share failure' }, 503);
    }
    const body = request.postDataJSON();
    return ok(route, {
      shares: body.recipientKnoprixIds.map((knoprixId) => ({
        knoprixId,
        shareId: `share-created-${nextId++}`,
        status: 'pending',
      })),
    }, 201);
  }
  if (/^\/v1\//.test(pathname)) return ok(route);
  if (pathname.startsWith('/api/')) {
    unmappedApiRequests.push(`${method} ${pathname}`);
    return response(route, { detail: 'Unmapped synthetic preview endpoint' }, 404);
  }
  return response(route, { detail: `Unhandled local route: ${method} ${pathname}` }, 404);
};

const authPayload = (verified = true) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    aud: 'knoprix-a64b7',
    auth_time: now,
    email: previewEmail,
    email_verified: verified,
    exp: now + 3600,
    firebase: { identities: { email: [previewEmail] }, sign_in_provider: 'password' },
    iat: now,
    iss: 'https://securetoken.google.com/knoprix-a64b7',
    sub: 'preview-user',
    user_id: 'preview-user',
  })).toString('base64url');
  return `e30.${payload}.signature`;
};

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 1024, height },
    reducedMotion: 'reduce',
  });

  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      if (url.pathname.startsWith('/api/')) return apiRoute(route);
      return route.continue();
    }

    if (url.hostname === 'identitytoolkit.googleapis.com') {
      if (url.pathname.endsWith('/accounts:signUp')) {
        return response(route, { error: { code: 400, message: 'EMAIL_EXISTS' } }, 400);
      }
      if (url.pathname.endsWith('/accounts:signInWithPassword')) {
        return response(route, {
          localId: 'preview-user',
          email: previewEmail,
          displayName: 'Avery Demo',
          idToken: authPayload(),
          registered: true,
          refreshToken: 'synthetic-refresh-token',
          expiresIn: '3600',
        });
      }
      if (url.pathname.endsWith('/accounts:lookup')) {
        return response(route, {
          users: [{
            localId: 'preview-user',
            email: previewEmail,
            emailVerified: true,
            displayName: 'Avery Demo',
            lastLoginAt: String(Date.now()),
            createdAt: String(Date.now()),
            providerUserInfo: [],
          }],
        });
      }
      if (url.pathname.endsWith('/accounts:sendOobCode')) {
        return response(route, { email: previewEmail });
      }
    }

    if (url.hostname === 'securetoken.googleapis.com' && url.pathname.endsWith('/token')) {
      return response(route, {
        access_token: authPayload(),
        expires_in: '3600',
        token_type: 'Bearer',
        refresh_token: 'synthetic-refresh-token',
        id_token: authPayload(),
        user_id: 'preview-user',
        project_id: 'knoprix-a64b7',
      });
    }

    blockedExternalRequests.push(url.href);
    return route.abort();
  });

  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const capture = async (name, options = {}) => {
    const target = path.join(output, `${name}.png`);
    await mkdir(path.dirname(target), { recursive: true });
    await page.screenshot({ path: target, animations: 'disabled', ...options });
    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    }));
    captures.push({
      file: path.relative(output, target),
      width: page.viewportSize().width,
      height: page.viewportSize().height,
      ...layout,
    });
  };

  await page.goto(origin);
  await page.getByRole('heading', { name: 'Enter quietly.' }).waitFor();
  if (process.env.PERF_REGRESSION_ONLY === 'true') {
    projectReadProbe.enabled = true;
    projectReadProbe.failBookmarksNext = true;
    await page.getByLabel('Email address').fill(previewEmail);
    await page.getByLabel('Password', { exact: true }).fill('synthetic-preview-password');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByRole('heading', { name: /Your reading ledger/i }).waitFor();
    await page.getByText('Research Brief.txt').first().waitFor();
    projectReadProbe.enabled = false;
    assert.deepEqual(
      projectReadProbe.requests.map((request) => request.path).sort(),
      ['bookmarks', 'documents'],
      'project selection must request documents and bookmarks once each',
    );
    const projectReadStartGap = Math.abs(
      projectReadProbe.requests[0].startedAt - projectReadProbe.requests[1].startedAt,
    );
    assert.ok(
      projectReadStartGap < 80,
      `project document and bookmark reads should overlap; observed a ${projectReadStartGap}ms start gap`,
    );
    await page.getByText('Could not fully load project data', { exact: true }).waitFor();
    await page.getByText('Research Brief.txt').first().waitFor();
    await page.getByRole('button', { name: /Research Library/ }).first().click();
    await page.getByTitle('Bookmark collection').click();
    await page.getByText('Bookmark Collection').waitFor();
    await page.getByRole('button', { name: /Open bookmark: Reading workflow/i }).waitFor();
    await page.getByRole('button', { name: /Open bookmark: Reading workflow/i }).click();
    await page.getByText('Patterns across sources', { exact: true }).waitFor();
    await page.locator('[data-page="2"]').waitFor();

    await page.getByTitle('Bookmark collection').click();
    await page.getByText('Bookmark Collection').waitFor();
    await page.getByLabel('Search bookmarks').fill('connected');
    await page.getByRole('button', { name: /Open bookmark: Connected knowledge/i }).waitFor();
    const trackBookmarkRemoveClick = () => page.evaluate(() => {
      window.__bookmarkRemoveClickAt = null;
      const listener = (event) => {
        const target = event.target instanceof Element
          ? event.target.closest('button[aria-label="Remove bookmark"]')
          : null;
        if (!target) return;
        window.__bookmarkRemoveClickAt = Date.now();
        document.removeEventListener('click', listener, true);
      };
      document.addEventListener('click', listener, true);
    });
    bookmarkDeleteProbe.failNext = true;
    await trackBookmarkRemoveClick();
    await page.getByRole('button', { name: 'Remove bookmark' }).click();
    await page.getByRole('button', { name: 'Removing bookmark' }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Removing bookmark' }).isDisabled(),
      true,
      'a pending deletion should provide immediate feedback and prevent duplicate requests',
    );
    await page.getByText('Could not delete bookmark', { exact: true }).waitFor();
    const failedDeleteClickAt = await page.evaluate(() => window.__bookmarkRemoveClickAt);
    const failedDeleteDelay = bookmarkDeleteProbe.lastStartedAt - failedDeleteClickAt;
    assert.ok(
      failedDeleteDelay < 100,
      `bookmark deletion should reach the API without an animation delay; observed ${failedDeleteDelay}ms`,
    );
    await page.getByRole('button', { name: /Open bookmark: Connected knowledge/i }).waitFor();

    await trackBookmarkRemoveClick();
    await page.getByRole('button', { name: 'Remove bookmark' }).click();
    await page.getByText('Removed bookmark', { exact: true }).waitFor();
    const retryDeleteClickAt = await page.evaluate(() => window.__bookmarkRemoveClickAt);
    const retryDeleteDelay = bookmarkDeleteProbe.lastStartedAt - retryDeleteClickAt;
    assert.ok(
      retryDeleteDelay < 100,
      `retrying bookmark deletion should also be immediate; observed ${retryDeleteDelay}ms`,
    );
    await page.getByRole('button', { name: /Open bookmark: Connected knowledge/i }).waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Close bookmark collection' }).click();

    await page.getByRole('button', { name: /contacts and sharing/i }).click();
    await page.getByRole('heading', { name: 'Contacts & sharing' }).waitFor();
    await page.getByText('KP-JORDA000002', { exact: true }).first().waitFor();
    await page.getByRole('checkbox', { name: 'KP-JORDA000002' }).check();
    shareRefreshProbe.enabled = true;
    shareCreateProbe.failNext = true;
    await page.getByRole('button', { name: 'Send share requests' }).click();
    await page.getByText('Synthetic share failure', { exact: true }).first().waitFor();
    assert.equal(
      await page.getByRole('checkbox', { name: 'KP-JORDA000002' }).isChecked(),
      true,
      'a failed share should retain the recipient selection for retry',
    );
    assert.equal(
      await page.getByText('KP-JORDA000002 · pending', { exact: true }).count(),
      0,
      'a failed share must not appear as sent',
    );
    await page.getByRole('button', { name: 'Send share requests' }).waitFor();
    await page.getByRole('button', { name: 'Send share requests' }).click();
    await page.getByText('1 share request sent', { exact: true }).waitFor();
    const shareAcknowledgementMs = Date.now() - shareCreateProbe.startedAt;
    console.log(`Mocked share submission triggered ${shareRefreshProbe.requests.length} follow-up refresh requests.`);
    assert.deepEqual(
      shareRefreshProbe.requests,
      [],
      'creating a share should update the sender view without refetching unrelated contact data',
    );
    assert.equal(
      await page.getByRole('button', { name: 'Sending…' }).count(),
      0,
      'the sender should leave the sending state as soon as the create request completes',
    );
    await page.getByText('KP-JORDA000002 · pending', { exact: true }).waitFor({ timeout: 500 });
    console.log(
      `PASS: local mocked UI regressions; project-read start gap ${projectReadStartGap}ms; bookmark delete API start ${failedDeleteDelay}ms after click; share acknowledgement ${shareAcknowledgementMs}ms; no post-share refresh requests.`,
    );
  } else {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const blackMirror = page.getByTestId('black-mirror');
  const blackMirrorStyle = await blackMirror.getAttribute('style');
  await page.mouse.move(24, 36);
  await page.waitForTimeout(50);
  assert.equal(
    await blackMirror.getAttribute('style'),
    blackMirrorStyle,
    'pointer movement must not change the login orb or ring styles',
  );
  const firstOrbit = blackMirror.locator('[data-orbit="a"]').first();
  const secondOrbit = blackMirror.locator('[data-orbit="b"]');
  const firstOrbitStyle = await firstOrbit.evaluate((element) => ({
    animationName: getComputedStyle(element).animationName,
    animationDuration: getComputedStyle(element).animationDuration,
    opacity: getComputedStyle(element).opacity,
    transform: getComputedStyle(element).transform,
  }));
  const secondOrbitStyle = await secondOrbit.evaluate((element) => ({
    animationName: getComputedStyle(element).animationName,
    animationDuration: getComputedStyle(element).animationDuration,
  }));
  assert.match(firstOrbitStyle.animationName, /knoprix-login-orbit-a/);
  assert.match(firstOrbitStyle.animationDuration, /32s/);
  assert.match(secondOrbitStyle.animationName, /knoprix-login-orbit-b/);
  assert.match(secondOrbitStyle.animationDuration, /48s/);
  await page.waitForTimeout(900);
  assert.notEqual(
    await firstOrbit.evaluate((element) => getComputedStyle(element).transform),
    firstOrbitStyle.transform,
    'login rings must rotate without pointer input',
  );
  assert.notEqual(
    await firstOrbit.evaluate((element) => getComputedStyle(element).opacity),
    firstOrbitStyle.opacity,
    'login rings must show the slow sheen pulse',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedTransform = await firstOrbit.evaluate((element) => getComputedStyle(element).transform);
  assert.equal(
    await firstOrbit.evaluate((element) => getComputedStyle(element).animationName),
    'none',
    'reduced motion must stop the login rings',
  );
  await page.waitForTimeout(400);
  assert.equal(
    await firstOrbit.evaluate((element) => getComputedStyle(element).transform),
    reducedTransform,
    'rings must remain still when reduced motion is enabled',
  );
  for (const width of widths) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    assert.equal(layout.documentWidth, layout.viewportWidth, `login overflow at ${width}px`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await capture(`auth/login-motion-${width}`, { animations: 'allow' });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height });
    await capture(`auth/login-reduced-motion-${width}`, { animations: 'allow' });
  }
  for (const width of widths) {
    await page.setViewportSize({ width, height });
    await capture(`auth/login-${width}`);
  }
  const passwordInput = page.getByLabel('Password', { exact: true });
  await passwordInput.fill('synthetic-preview-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  assert.equal(await passwordInput.getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  assert.equal(await passwordInput.getAttribute('type'), 'password');
  await passwordInput.fill('');
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByRole('heading', { name: 'REGISTER' }).waitFor();
  for (const width of widths) {
    await page.setViewportSize({ width, height });
    await capture(`auth/register-${width}`);
  }

  await page.getByLabel('Full name').fill('Avery Demo');
  await page.getByLabel('Email address').fill(previewEmail);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-preview-password');
  await page.getByRole('button', { name: /create account/i }).click();
  await page.getByRole('button', { name: /sign in to verify and link/i }).waitFor();
  await capture('auth/duplicate-account-recovery-1024');
  await page.getByRole('button', { name: /sign in to verify and link/i }).click();
  await page.getByLabel('Email address').fill(previewEmail);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-preview-password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('heading', { name: /Your reading ledger/i }).waitFor();
  await page.getByText('Research Brief.txt').first().waitFor();

  for (const width of widths) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => localStorage.removeItem('knoprix_sidebar_collapsed'));
    await capture(`dashboard/overview-${width}`);
  }
  await page.setViewportSize({ width: 390, height });
  await page.getByTitle('Toggle folders').click();
  await capture('dashboard/mobile-navigation-open-390');
  await page.getByRole('button', { name: /close navigation/i }).click();

  await page.getByRole('button', { name: 'In progress' }).click();
  await capture('dashboard/filter-in-progress-1024');
  await page.getByRole('button', { name: 'All files' }).click();
  await page.getByLabel('Search documents').fill('Research');
  await capture('dashboard/filter-document-search-1024');
  await page.getByLabel('Search documents').fill('');

  await page.setViewportSize({ width: 1024, height });
  await page.getByPlaceholder(/Trie autocomplete/i).fill('sig');
  await page.waitForTimeout(400);
  await capture('search/trie-autocomplete-1024');
  await page.getByPlaceholder(/Trie autocomplete/i).fill('signal processing');
  await page.waitForTimeout(400);
  await capture('search/inverted-index-results-1024');
  await page.getByPlaceholder(/Trie autocomplete/i).fill('');

  await page.getByTitle('Command palette (Ctrl K)').click();
  await page.getByRole('dialog', { name: 'Command palette' }).waitFor();
  await capture('command-palette/actions-1024');
  await page.getByLabel('Search documents or actions').fill('Research');
  await capture('command-palette/document-search-1024');
  await page.keyboard.press('Escape');

  await page.getByTitle('Create project').click();
  await page.getByPlaceholder('Project name…').fill('Synthetic project');
  await capture('projects/create-form-1024');
  await page.locator('form').filter({ has: page.getByPlaceholder('Project name…') }).locator('button[type="submit"]').click();
  await page.getByText('Synthetic project', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: /Research Library/ }).first().click();
  await page.getByText('Research Brief.txt').first().waitFor();

  await page.getByRole('button', { name: 'Upload file', exact: true }).click();
  await page.getByText(/Drag & drop your document here/).waitFor();
  await capture('upload/dropzone-1024');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'Demo field notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Synthetic upload fixture only.'),
  });
  await page.getByText(/Demo field notes\.txt — uploaded!/).waitFor();
  await capture('upload/mock-success-1024');
  await page.getByText(/uploaded to the project/i).waitFor({ state: 'detached' });
  await page.getByText('Research Brief.txt').first().click();
  await page.getByText('A durable research practice turns scattered reading into connected knowledge.').waitFor();

  for (const width of widths) {
    await page.setViewportSize({ width, height });
    await capture(`reader/text-document-${width}`);
  }

  await page.getByTitle('View mode').click();
  await page.getByRole('menu').waitFor();
  await capture('reader/view-mode-options-1024');
  await page.getByRole('menuitem', { name: 'Single Page' }).click();
  await capture('reader/single-page-mode-1024');
  await page.getByTitle('View mode').click();
  await page.getByRole('menuitem', { name: 'Continuous' }).click();

  await page.locator('button[title="Choose annotation tool"]').click();
  await page.getByRole('menu').waitFor();
  await capture('reader/annotation-tools-1024');
  await page.locator('button[title="Choose annotation tool"]').click();
  await page.getByRole('button', { name: 'Bookmark page 1' }).click();
  await page.getByRole('dialog', { name: 'Save bookmark' }).waitFor();
  await capture('reader/page-bookmark-dialog-1024');
  await page.getByRole('button', { name: 'Save bookmark' }).click();
  await page.getByText(/bookmark added to your collection/i).waitFor();

  await page.getByTitle('Enter focus mode').click();
  await capture('reader/focus-mode-1024');
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    const target = 'reason a passage mattered';
    const walker = document.createTreeWalker(document.querySelector('[data-page="1"]'), NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const start = node.textContent.indexOf(target);
      if (start >= 0) {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + target.length);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        node.parentElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return;
      }
    }
    throw new Error('Synthetic selection text not found');
  });
  await page.getByRole('button', { name: 'Bookmark selected passage' }).waitFor();
  await capture('reader/selection-actions-1024');
  await page.getByRole('button', { name: 'Bookmark selected passage' }).click();
  await page.getByRole('dialog', { name: 'Save bookmark' }).waitFor();
  await capture('reader/bookmark-name-dialog-1024');
  await page.getByLabel('Bookmark name').fill('Core idea');
  await page.getByRole('button', { name: 'Save bookmark' }).click();
  await page.getByText(/bookmark added to your collection/i).waitFor();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.locator('button[title="Choose annotation tool"]').click();
  await page.getByRole('menu').waitFor();
  await page.getByRole('menuitem', { name: /Green Highlighter/i }).click();
  await page.evaluate(() => {
    const target = 'scattered reading';
    const walker = document.createTreeWalker(document.querySelector('[data-page="1"]'), NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const start = node.textContent.indexOf(target);
      if (start >= 0) {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + target.length);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        node.parentElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return;
      }
    }
    throw new Error('Synthetic highlight text not found');
  });
  await page.getByTitle('Apply green to this selection').click();
  await page.getByText(/Highlighted — saved for this document/i).waitFor();
  await capture('reader/saved-highlight-1024');

  await page.getByTitle('Bookmark collection').click();
  await page.getByText('Bookmark Collection').waitFor();
  for (const width of widths) {
    await page.setViewportSize({ width, height });
    await capture(`bookmarks/collection-${width}`);
  }
  await page.getByLabel('Search bookmarks').fill('connected');
  await page.waitForTimeout(300);
  await capture('bookmarks/search-results-1024');
  await page.getByRole('button', { name: /Edit bookmark: Connected knowledge/i }).click();
  await page.getByLabel('Notes').fill('Synthetic preview note for the edit workflow.');
  await capture('bookmarks/edit-bookmark-1024');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const bookmarkUpdatedToast = page.getByText('Bookmark updated', { exact: true });
  await bookmarkUpdatedToast.waitFor({ state: 'visible' });
  await bookmarkUpdatedToast.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Close bookmark collection' }).click();

  await page.getByRole('button', { name: /contacts and sharing/i }).click();
  await page.getByRole('heading', { name: 'Contacts & sharing' }).waitFor();
  for (const width of widths) {
    await page.setViewportSize({ width, height });
    const closeNavigation = page.getByRole('button', { name: /close navigation/i });
    if (await closeNavigation.isVisible()) {
      await closeNavigation.click();
      await page.waitForTimeout(300);
    }
    const panel = page.locator('section[aria-labelledby="contacts-heading"]');
    await panel.evaluate((element) => { element.scrollTop = 0; });
    await capture(`contacts/overview-${width}`);
  }
  const contactsPanel = page.locator('section[aria-labelledby="contacts-heading"]');
  await page.setViewportSize({ width: 390, height });
  const closeNavigation = page.getByRole('button', { name: /close navigation/i });
  if (await closeNavigation.isVisible()) {
    await closeNavigation.click();
    await page.waitForTimeout(300);
  }
  await contactsPanel.evaluate((element) => { element.scrollTop = Math.round(element.scrollHeight / 2); });
  await capture('contacts/sharing-sections-mid-390');
  await contactsPanel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await capture('contacts/sharing-sections-bottom-390');
  await page.setViewportSize({ width: 1024, height });
  await contactsPanel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await capture('contacts/sharing-sections-bottom-1024');
  await contactsPanel.evaluate((element) => { element.scrollTop = 0; });
  await page.getByLabel('Find someone by Knoprix ID').fill('KP-SYNTH00001');
  await page.getByRole('button', { name: 'Find' }).click();
  await page.getByText('KP-SYNTH00001', { exact: true }).waitFor();
  await capture('contacts/lookup-result-1024');
  await page.getByRole('button', { name: 'View read-only' }).click();
  const sharedResourceHeading = page.getByRole('heading', { name: 'Read-only bookmark' });
  await sharedResourceHeading.waitFor();
  await sharedResourceHeading.scrollIntoViewIfNeeded();
  await capture('contacts/read-only-shared-resource-1024');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: /close contacts/i }).click();

  await page.getByRole('button', { name: /Research Library/ }).first().click();
  await page.getByRole('heading', { name: /Your reading ledger/i }).waitFor();
  await page.getByRole('button', { name: 'Knowledge map' }).click();
  await page.getByRole('dialog', { name: 'Knowledge map' }).waitFor();
  for (const width of widths) {
    await page.setViewportSize({ width, height });
    await capture(`knowledge-map/overview-${width}`);
  }
  await page.locator('svg g.cursor-pointer').first().click();
  await page.getByText(/Grounded in the pages below/i).waitFor();
  await capture('knowledge-map/concept-evidence-1024');
  await page.getByLabel('Track a word').fill('index');
  await page.getByRole('button', { name: 'Track', exact: true }).click();
  await page.getByText('index', { exact: true }).waitFor();
  await capture('knowledge-map/tracked-concept-1024');
  await page.getByRole('button', { name: 'Close map' }).click();

  await page.getByTitle('DSA Index Visualizer').click();
  await page.getByRole('heading', { name: 'DSA Index Visualizer' }).waitFor();
  for (const width of widths) {
    await page.setViewportSize({ width, height });
    await capture(`dsa-visualizer/overview-${width}`);
  }
  await page.getByLabel('Heap demo query').fill('signal');
  await page.getByRole('button', { name: 'Rank' }).click();
  await page.getByText(/considered →/).waitFor();
  await capture('dsa-visualizer/top-k-results-1024');
  await page.getByRole('button').filter({ has: page.locator('svg.lucide-x') }).last().click();

  await page.getByRole('button', { name: /Research Brief\.txt/i }).first().click();
  await page.getByTitle('Chat with your documents').click();
  await page.getByRole('dialog', { name: 'Document chat' }).waitFor();
  for (const width of widths) {
    await page.setViewportSize({ width, height });
    await capture(`document-chat/overview-${width}`);
  }
  await page.getByRole('button', { name: 'Understood' }).click();
  await page.getByLabel('Chat question').fill('How does the example connect ideas?');
  await page.getByTitle('Ask').click();
  await page.getByText(/The notes use signal processing/i).waitFor();
  await capture('document-chat/answer-with-citation-1024');
  await page.getByRole('button', { name: /Summarize Research Brief\.txt/i }).click();
  await page.getByText('Summary · 3 key lines (quoted, not invented)').waitFor();
  await capture('document-chat/document-summary-1024');
  await page.getByTitle('Full screen').click();
  await capture('document-chat/full-screen-1024');
  await page.getByTitle('Close chat').click();

  await page.getByRole('button', { name: /Research Library/ }).first().click();
  await page.getByRole('heading', { name: /Your reading ledger/i }).waitFor();
  await page.getByTitle('Toggle theme').click();
  await capture('theme/light-dashboard-1024');
  await page.getByTitle('Toggle theme').click();

  await page.getByRole('button', { name: /Applied Index\.pdf/i }).first().click();
  await page.waitForFunction(() => [...document.querySelectorAll('canvas')].some((canvas) => canvas.width > 0));
  for (const width of widths) {
    await page.setViewportSize({ width, height });
    await capture(`reader/pdf-canvas-${width}`);
  }
  await page.getByRole('button', { name: 'Show page thumbnails' }).click();
  await page.getByRole('complementary', { name: 'Page thumbnails' }).waitFor();
  await capture('reader/pdf-thumbnails-1024');
  await page.getByRole('button', { name: 'Go to page 2' }).click();
  await capture('reader/pdf-page-navigation-1024');
  await page.getByRole('button', { name: 'Bookmark page 2' }).click();
  await page.getByRole('dialog', { name: 'Save bookmark' }).waitFor();
  await capture('reader/pdf-page-bookmark-dialog-1024');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: /Signal Systems\.pptx/i }).first().click();
  await page.getByText('Signal Systems', { exact: true }).waitFor();
  for (const width of widths) {
    await page.setViewportSize({ width, height });
    await capture(`reader/slides-document-${width}`);
  }
  await page.getByRole('button', { name: /Text Fallback\.pdf/i }).first().click();
  await page.getByText(/Text-first preview/i).waitFor();
  await capture('reader/pdf-text-fallback-1024');

  assert.deepEqual(unmappedApiRequests, [], `unmapped local API requests: ${unmappedApiRequests.join('; ')}`);
  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join('; ')}`);

  const overflowCount = captures.filter((captureItem) => captureItem.horizontalOverflow).length;
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl: origin,
    dataMode: 'synthetic-fixtures-only',
    externalRequestsAllowed: false,
    breakpoints: widths.map((width) => ({ width, height })),
    captures,
    horizontalOverflowCaptureCount: overflowCount,
    blockedExternalRequestCount: blockedExternalRequests.length,
    notes: [
      'Firebase Auth and Knoprix API responses are intercepted locally.',
      'Unrecognized third-party requests are aborted; no live account, production data, external API, or persistent backend write is used.',
      'The PDF reader uses a generated local fixture; a separate PDF demonstrates the extracted-text fallback.',
    ],
  }, null, 2)}\n`);

  console.log(`PASS: captured ${captures.length} screenshots; no page errors or unmapped API calls; ${overflowCount} layouts report horizontal overflow; ${blockedExternalRequests.length} unmocked external requests were aborted.`);
  }
} finally {
  await browser.close();
}
