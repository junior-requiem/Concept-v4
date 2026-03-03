const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;

const criteria = {
  targetStates: ['VA', 'MD', 'DC', 'TX', 'CA'],
  minContractValue: 250000,
  idealContractValue: 1000000,
  oracleFusionKeywords: ['oracle fusion', 'erp modernization', 'financials cloud'],
  targetAgencies: ['Department of Defense', 'GSA', 'HHS', 'VA', 'State Department'],
  sourceBoost: {
    GovWin: 20,
    SamGov: 10,
    GovTribe: 8,
  },
  mustHaveOracleFusionSignal: false,
  urgencyWindowDays: 180,
  weights: {
    contractValue: 20,
    geography: 18,
    agency: 22,
    oracleIntent: 25,
    sourceQuality: 10,
    timing: 5,
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

function clamp(n, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}

function scoreLead(rawLead) {
  const notes = [];
  const fits = {};

  const value = Number(rawLead.contractValue || 0);
  const minimum = Number(criteria.minContractValue || 0);
  const ideal = Math.max(Number(criteria.idealContractValue || minimum), minimum || 1);
  if (value >= minimum) {
    const idealProgress = clamp((value - minimum) / Math.max(ideal - minimum, 1));
    fits.contractValue = clamp(0.7 + idealProgress * 0.3);
    notes.push(`Contract value $${value.toLocaleString()} meets minimum and aligns with target deal size.`);
  } else {
    fits.contractValue = clamp(value / Math.max(minimum, 1)) * 0.6;
    notes.push(`Contract value $${value.toLocaleString()} is below minimum threshold.`);
  }

  const state = String(rawLead.state || '').toUpperCase();
  fits.geography = criteria.targetStates.includes(state) ? 1 : 0;
  notes.push(
    fits.geography
      ? `State ${state} is in target geography.`
      : `State ${state || 'N/A'} is outside target geography.`,
  );

  const agency = String(rawLead.agency || '');
  const agencyMatch = criteria.targetAgencies.find((a) => agency.toLowerCase().includes(a.toLowerCase()));
  fits.agency = agencyMatch ? 1 : 0;
  notes.push(
    fits.agency
      ? `Agency fit confirmed via target match: ${agencyMatch}.`
      : `Agency ${agency || 'N/A'} does not match target agency list.`,
  );

  const textBlob = `${rawLead.title || ''} ${rawLead.description || ''}`.toLowerCase();
  const keywordHits = criteria.oracleFusionKeywords.filter((keyword) => textBlob.includes(keyword.toLowerCase()));
  fits.oracleIntent = clamp(keywordHits.length / Math.max(criteria.oracleFusionKeywords.length, 1));
  notes.push(
    keywordHits.length > 0
      ? `Oracle Fusion intent detected through keywords: ${keywordHits.join(', ')}.`
      : 'No Oracle Fusion intent signal detected in title/description.',
  );

  const source = String(rawLead.source || 'Unknown');
  const boost = Number(criteria.sourceBoost[source] || 0);
  const maxBoost = Math.max(...Object.values(criteria.sourceBoost).map((n) => Number(n || 0)), 1);
  fits.sourceQuality = clamp(boost / maxBoost);
  notes.push(
    boost > 0
      ? `Source quality boost applied for ${source}: +${boost}.`
      : `No configured source boost for ${source}; treated as lower confidence source.`,
  );

  let timingFit = 0.5;
  if (rawLead.dueDate) {
    const due = new Date(rawLead.dueDate);
    const daysUntilDue = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (!Number.isNaN(daysUntilDue) && daysUntilDue >= 0) {
      timingFit = clamp(1 - daysUntilDue / Math.max(criteria.urgencyWindowDays, 1), 0.25, 1);
      notes.push(`Due date urgency fit is ${Math.round(timingFit * 100)}% (${daysUntilDue} day(s) out).`);
    } else {
      timingFit = 0.2;
      notes.push('Due date appears expired or invalid, reducing timing fit.');
    }
  } else {
    notes.push('Due date missing; timing fit set to neutral.');
  }
  fits.timing = timingFit;

  const weights = criteria.weights;
  const weightedTotal =
    fits.contractValue * weights.contractValue
    + fits.geography * weights.geography
    + fits.agency * weights.agency
    + fits.oracleIntent * weights.oracleIntent
    + fits.sourceQuality * weights.sourceQuality
    + fits.timing * weights.timing;
  const maxPossible = Object.values(weights).reduce((acc, n) => acc + Number(n || 0), 0) || 1;

  let score = Math.round((weightedTotal / maxPossible) * 100);

  if (criteria.mustHaveOracleFusionSignal && fits.oracleIntent === 0) {
    score = Math.min(score, 35);
    notes.push('Lead blocked from high ranking: Oracle Fusion signal is required by policy.');
  }

  const populatedFields = [rawLead.title, rawLead.agency, rawLead.state, rawLead.contractValue, rawLead.description, rawLead.dueDate]
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== '').length;
  const completeness = populatedFields / 6;
  const confidenceScore = clamp((completeness * 0.6) + ((fits.oracleIntent + fits.agency + fits.geography) / 3) * 0.4);
  const confidence = confidenceScore >= 0.75 ? 'High' : confidenceScore >= 0.45 ? 'Medium' : 'Low';

  const rank = score >= 85 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : 1;

  return {
    score,
    rank,
    confidence,
    confidenceScore: Math.round(confidenceScore * 100),
    fitBreakdown: {
      contractValue: Math.round(fits.contractValue * 100),
      geography: Math.round(fits.geography * 100),
      agency: Math.round(fits.agency * 100),
      oracleIntent: Math.round(fits.oracleIntent * 100),
      sourceQuality: Math.round(fits.sourceQuality * 100),
      timing: Math.round(fits.timing * 100),
    },
    notes,
  };
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
    confidence: scored.confidence,
    confidenceScore: scored.confidenceScore,
    fitBreakdown: scored.fitBreakdown,
    notes: scored.notes,
    createdAt: new Date().toISOString(),
  };
}

function rescoreAllLeads() {
  for (let i = 0; i < leads.length; i += 1) {
    const rescored = scoreLead(leads[i]);
    leads[i].score = rescored.score;
    leads[i].rank = rescored.rank;
    leads[i].confidence = rescored.confidence;
    leads[i].confidenceScore = rescored.confidenceScore;
    leads[i].fitBreakdown = rescored.fitBreakdown;
    leads[i].notes = rescored.notes;
  }
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
      if (typeof body.idealContractValue === 'number') criteria.idealContractValue = body.idealContractValue;
      if (Array.isArray(body.oracleFusionKeywords)) criteria.oracleFusionKeywords = body.oracleFusionKeywords;
      if (Array.isArray(body.targetAgencies)) criteria.targetAgencies = body.targetAgencies;
      if (body.sourceBoost && typeof body.sourceBoost === 'object') criteria.sourceBoost = body.sourceBoost;
      if (typeof body.mustHaveOracleFusionSignal === 'boolean') criteria.mustHaveOracleFusionSignal = body.mustHaveOracleFusionSignal;
      if (typeof body.urgencyWindowDays === 'number') criteria.urgencyWindowDays = body.urgencyWindowDays;
      if (body.weights && typeof body.weights === 'object') {
        criteria.weights = {
          ...criteria.weights,
          ...body.weights,
        };
      }

      rescoreAllLeads();

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
    const confidenceFilter = searchParams.get('confidence');
    const filtered = leads
      .filter((lead) => (rankFilter ? lead.rank === rankFilter : true))
      .filter((lead) => (sourceFilter ? lead.source.toLowerCase() === sourceFilter.toLowerCase() : true))
      .filter((lead) => (confidenceFilter ? lead.confidence.toLowerCase() === confidenceFilter.toLowerCase() : true))
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
