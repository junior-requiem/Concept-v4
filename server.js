const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;

const criteria = {
  targetStates: ['VA', 'MD', 'DC', 'TX', 'CA'],
  minContractValue: 250000,
  oracleFusionKeywords: ['oracle fusion', 'erp modernization', 'financials cloud'],
  targetAgencies: ['Department of Defense', 'GSA', 'HHS', 'VA', 'State Department'],
  sourceBoost: {
    GovWin: 20,
    SamGov: 10,
    GovTribe: 8,
  },
};

let leadId = 1;
const leads = [];

function json(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.socket.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
}

function scoreLead(rawLead) {
  const notes = [];
  let score = 0;

  const value = Number(rawLead.contractValue || 0);
  if (value >= criteria.minContractValue) {
    score += 20;
    notes.push(`Contract value $${value.toLocaleString()} meets min value.`);
  } else {
    notes.push(`Contract value $${value.toLocaleString()} is below minimum.`);
  }

  const state = String(rawLead.state || '').toUpperCase();
  if (criteria.targetStates.includes(state)) {
    score += 20;
    notes.push(`State ${state} matches target geography.`);
  } else {
    notes.push(`State ${state || 'N/A'} is outside target geography.`);
  }

  const agency = String(rawLead.agency || '');
  if (criteria.targetAgencies.some((a) => agency.toLowerCase().includes(a.toLowerCase()))) {
    score += 20;
    notes.push(`Agency ${agency} matches target agency list.`);
  } else {
    notes.push(`Agency ${agency || 'N/A'} not in target agency list.`);
  }

  const textBlob = `${rawLead.title || ''} ${rawLead.description || ''}`.toLowerCase();
  const keywordHits = criteria.oracleFusionKeywords.filter((keyword) => textBlob.includes(keyword.toLowerCase()));
  if (keywordHits.length > 0) {
    score += 25;
    notes.push(`Matched Oracle Fusion intent via: ${keywordHits.join(', ')}.`);
  } else {
    notes.push('No Oracle Fusion keywords matched.');
  }

  const source = String(rawLead.source || 'Unknown');
  const boost = criteria.sourceBoost[source] || 0;
  score += boost;
  if (boost > 0) {
    notes.push(`Source boost applied for ${source}: +${boost}.`);
  } else {
    notes.push(`No source boost configured for ${source}.`);
  }

  score = Math.max(0, Math.min(score, 100));

  const rank = score >= 85 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : 1;

  return { score, rank, notes };
}

function normalizeLead(input) {
  const scored = scoreLead(input);
  return {
    id: leadId++,
    source: input.source || 'Unknown',
    title: input.title || 'Untitled lead',
    agency: input.agency || 'Unknown agency',
    state: (input.state || '').toUpperCase(),
    contractValue: Number(input.contractValue || 0),
    dueDate: input.dueDate || null,
    description: input.description || '',
    score: scored.score,
    rank: scored.rank,
    notes: scored.notes,
    createdAt: new Date().toISOString(),
  };
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(__dirname, 'public', path.normalize(safePath));

  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    json(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      json(res, 404, { error: 'File not found' });
      return;
    }
    const ext = path.extname(filePath);
    const types = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(content);
  });
}

function seedData() {
  const seedLeads = [
    {
      source: 'GovWin',
      title: 'Oracle Fusion Financials Modernization - HHS',
      agency: 'Department of Health and Human Services',
      state: 'MD',
      contractValue: 2500000,
      dueDate: '2026-02-15',
      description: 'ERP modernization with Oracle Fusion Financials Cloud and procurement modules.',
    },
    {
      source: 'GovWin',
      title: 'State ERP Platform Refresh',
      agency: 'State Department of Transportation',
      state: 'CO',
      contractValue: 380000,
      dueDate: '2026-03-01',
      description: 'Upgrade legacy accounting and HR systems.',
    },
    {
      source: 'SamGov',
      title: 'DoD Cloud Migration Support',
      agency: 'Department of Defense',
      state: 'VA',
      contractValue: 1200000,
      dueDate: '2026-01-10',
      description: 'Includes Oracle Fusion integration and cloud ERP implementation support.',
    },
  ];

  seedLeads.forEach((lead) => leads.push(normalizeLead(lead)));
}

seedData();

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const { pathname, searchParams } = requestUrl;

  if (pathname === '/api/criteria' && req.method === 'GET') {
    json(res, 200, criteria);
    return;
  }

  if (pathname === '/api/criteria' && req.method === 'PUT') {
    try {
      const body = await parseBody(req);
      if (Array.isArray(body.targetStates)) criteria.targetStates = body.targetStates.map((s) => String(s).toUpperCase());
      if (typeof body.minContractValue === 'number') criteria.minContractValue = body.minContractValue;
      if (Array.isArray(body.oracleFusionKeywords)) criteria.oracleFusionKeywords = body.oracleFusionKeywords;
      if (Array.isArray(body.targetAgencies)) criteria.targetAgencies = body.targetAgencies;
      if (body.sourceBoost && typeof body.sourceBoost === 'object') criteria.sourceBoost = body.sourceBoost;

      for (let i = 0; i < leads.length; i += 1) {
        const rescored = scoreLead(leads[i]);
        leads[i].score = rescored.score;
        leads[i].rank = rescored.rank;
        leads[i].notes = rescored.notes;
      }

      json(res, 200, { ok: true, criteria });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === '/api/leads' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const incoming = Array.isArray(body) ? body : [body];
      const created = incoming.map(normalizeLead);
      leads.push(...created);
      json(res, 201, { created: created.length, leads: created });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === '/api/leads' && req.method === 'GET') {
    const rankFilter = Number(searchParams.get('rank') || 0);
    const sourceFilter = searchParams.get('source');
    const filtered = leads
      .filter((lead) => (rankFilter ? lead.rank === rankFilter : true))
      .filter((lead) => (sourceFilter ? lead.source.toLowerCase() === sourceFilter.toLowerCase() : true))
      .sort((a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt));

    json(res, 200, { total: filtered.length, leads: filtered });
    return;
  }

  if (pathname === '/api/funnel' && req.method === 'GET') {
    const funnel = [1, 2, 3, 4, 5].map((rank) => ({
      rank,
      label: rank === 1 ? 'Not likely' : rank === 5 ? 'Strong lead' : `Rank ${rank}`,
      count: leads.filter((lead) => lead.rank === rank).length,
      topLead: leads.filter((lead) => lead.rank === rank).sort((a, b) => b.score - a.score)[0] || null,
    }));
    json(res, 200, funnel);
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Lead platform running at http://localhost:${PORT}`);
});
