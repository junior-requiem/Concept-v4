const funnelNode = document.querySelector('#funnel');
const leadListNode = document.querySelector('#lead-list');
const leadTemplate = document.querySelector('#lead-template');
const leadTitle = document.querySelector('#lead-title');
const resetButton = document.querySelector('#reset-filter');
const criteriaForm = document.querySelector('#criteria-form');

let selectedRank = null;
let dataMode = 'api';

const rankLabels = {
  1: 'Not likely',
  2: 'Monitor',
  3: 'Qualified',
  4: 'High potential',
  5: 'Strong lead',
};

const defaultCriteria = {
  targetStates: ['VA', 'MD', 'DC', 'TX', 'CA'],
  minContractValue: 250000,
  idealContractValue: 1000000,
  oracleFusionKeywords: ['oracle fusion', 'erp modernization', 'financials cloud'],
  targetAgencies: ['Department of Defense', 'GSA', 'HHS', 'VA', 'State Department'],
  mustHaveOracleFusionSignal: false,
};

const defaultLeads = [
  {
    id: 1,
    source: 'GovWin',
    title: 'Oracle Fusion Financials Modernization - HHS',
    agency: 'Department of Health and Human Services',
    state: 'MD',
    contractValue: 2500000,
    dueDate: '2026-02-15',
    score: 91,
    rank: 5,
    confidence: 'High',
    confidenceScore: 92,
    fitBreakdown: { oracleIntent: 100, agency: 100 },
    notes: ['Oracle Fusion intent detected via modernization scope.', 'Agency and state match target profile.'],
  },
  {
    id: 2,
    source: 'GovWin',
    title: 'State ERP Platform Refresh',
    agency: 'State Department of Transportation',
    state: 'CO',
    contractValue: 380000,
    dueDate: '2026-03-01',
    score: 41,
    rank: 2,
    confidence: 'Medium',
    confidenceScore: 52,
    fitBreakdown: { oracleIntent: 0, agency: 30 },
    notes: ['No direct Oracle Fusion keyword signal.', 'Value is above minimum but geography is outside target focus.'],
  },
  {
    id: 3,
    source: 'SamGov',
    title: 'DoD Cloud Migration Support',
    agency: 'Department of Defense',
    state: 'VA',
    contractValue: 1200000,
    dueDate: '2026-01-10',
    score: 79,
    rank: 4,
    confidence: 'High',
    confidenceScore: 84,
    fitBreakdown: { oracleIntent: 70, agency: 100 },
    notes: ['Includes Oracle Fusion integration language.', 'Strong agency and geography fit with high contract value.'],
  },
];

const DEMO_CRITERIA_KEY = 'concept-v4-demo-criteria';
const DEMO_LEADS_KEY = 'concept-v4-demo-leads';

function getStoredJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setStoredJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getDemoCriteria() {
  return getStoredJSON(DEMO_CRITERIA_KEY, defaultCriteria);
}

function getDemoLeads() {
  return getStoredJSON(DEMO_LEADS_KEY, defaultLeads);
}

function saveDemoCriteria(criteria) {
  setStoredJSON(DEMO_CRITERIA_KEY, criteria);
}

function toCSV(items) {
  return items.join(', ');
}

function fromCSV(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function apiPath(path) {
  return `api${path}`;
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function requestData(path, options = {}) {
  if (dataMode === 'demo') {
    return demoRequest(path, options);
  }

  try {
    return await fetchJSON(apiPath(path), options);
  } catch (error) {
    dataMode = 'demo';
    return demoRequest(path, options);
  }
}

async function demoRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const leads = getDemoLeads();

  if (path === '/criteria' && method === 'GET') {
    return getDemoCriteria();
  }

  if (path === '/criteria' && method === 'PUT') {
    const body = options.body ? JSON.parse(options.body) : {};
    const updated = {
      ...getDemoCriteria(),
      ...body,
    };
    saveDemoCriteria(updated);
    return { ok: true, criteria: updated };
  }

  if (path.startsWith('/leads') && method === 'GET') {
    const query = path.split('?')[1];
    const rank = query ? Number(new URLSearchParams(query).get('rank')) : null;
    const filtered = rank ? leads.filter((lead) => lead.rank === rank) : leads;
    return { leads: filtered };
  }

  if (path === '/funnel' && method === 'GET') {
    return [1, 2, 3, 4, 5].map((rank) => {
      const bucket = leads.filter((lead) => lead.rank === rank);
      const topLead = bucket.sort((a, b) => b.score - a.score)[0] || null;
      return {
        rank,
        label: rankLabels[rank],
        count: bucket.length,
        topLead,
      };
    });
  }

  throw new Error(`Unsupported demo route: ${method} ${path}`);
}

async function loadCriteria() {
  const criteria = await requestData('/criteria');
  criteriaForm.targetStates.value = toCSV(criteria.targetStates);
  criteriaForm.minContractValue.value = criteria.minContractValue;
  criteriaForm.idealContractValue.value = criteria.idealContractValue || '';
  criteriaForm.mustHaveOracleFusionSignal.checked = Boolean(criteria.mustHaveOracleFusionSignal);
  criteriaForm.oracleFusionKeywords.value = toCSV(criteria.oracleFusionKeywords);
  criteriaForm.targetAgencies.value = toCSV(criteria.targetAgencies);
}

function renderLeads(leads) {
  leadListNode.innerHTML = '';
  if (!leads.length) {
    leadListNode.innerHTML = '<p class="empty">No leads in this selection.</p>';
    return;
  }

  leads.forEach((lead) => {
    const fragment = leadTemplate.content.cloneNode(true);
    fragment.querySelector('.lead-top').textContent = `${lead.source} • Rank ${lead.rank} • Score ${lead.score} • Confidence ${lead.confidence || 'N/A'} (${lead.confidenceScore || 0}%)`;
    fragment.querySelector('h3').textContent = lead.title;
    const fit = lead.fitBreakdown || {};
    fragment.querySelector('.lead-meta').textContent = `${lead.agency} | ${lead.state} | $${lead.contractValue.toLocaleString()} | Due ${lead.dueDate || 'TBD'} | Intent ${fit.oracleIntent || 0}% | Agency ${fit.agency || 0}%`;

    const notesNode = fragment.querySelector('.notes');
    lead.notes.forEach((note) => {
      const li = document.createElement('li');
      li.textContent = note;
      notesNode.appendChild(li);
    });

    leadListNode.appendChild(fragment);
  });
}

async function loadLeads() {
  const query = selectedRank ? `?rank=${selectedRank}` : '';
  const data = await requestData(`/leads${query}`);
  leadTitle.textContent = selectedRank ? `Rank ${selectedRank} • ${rankLabels[selectedRank]}` : 'All Leads';
  renderLeads(data.leads);
}

async function loadFunnel() {
  const funnel = await requestData('/funnel');
  funnelNode.innerHTML = '';

  funnel
    .sort((a, b) => b.rank - a.rank)
    .forEach((tier) => {
      const tierNode = document.createElement('button');
      tierNode.type = 'button';
      tierNode.className = 'funnel-tier';
      if (selectedRank === tier.rank) tierNode.classList.add('active');
      tierNode.innerHTML = `
        <span class="rank-chip">Rank ${tier.rank}</span><br />
        <strong>${tier.label || rankLabels[tier.rank]}</strong><br />
        ${tier.count} lead(s)
        ${tier.topLead ? `<br /><small>Top: ${tier.topLead.title} (${tier.topLead.source})</small>` : ''}
      `;
      tierNode.addEventListener('click', async () => {
        selectedRank = selectedRank === tier.rank ? null : tier.rank;
        await loadFunnel();
        await loadLeads();
      });
      funnelNode.appendChild(tierNode);
    });
}

criteriaForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    targetStates: fromCSV(criteriaForm.targetStates.value).map((s) => s.toUpperCase()),
    minContractValue: Number(criteriaForm.minContractValue.value),
    idealContractValue: Number(criteriaForm.idealContractValue.value),
    oracleFusionKeywords: fromCSV(criteriaForm.oracleFusionKeywords.value),
    targetAgencies: fromCSV(criteriaForm.targetAgencies.value),
    mustHaveOracleFusionSignal: criteriaForm.mustHaveOracleFusionSignal.checked,
  };
  await requestData('/criteria', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  await loadFunnel();
  await loadLeads();
});

resetButton.addEventListener('click', async () => {
  selectedRank = null;
  await loadFunnel();
  await loadLeads();
});

(async function init() {
  await loadCriteria();
  await loadFunnel();
  await loadLeads();
})();
