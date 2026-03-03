const funnelNode = document.querySelector('#funnel');
const leadListNode = document.querySelector('#lead-list');
const leadTemplate = document.querySelector('#lead-template');
const leadTitle = document.querySelector('#lead-title');
const resetButton = document.querySelector('#reset-filter');
const criteriaForm = document.querySelector('#criteria-form');

let selectedRank = null;

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
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

async function loadCriteria() {
  const criteria = await fetchJSON('/api/criteria');
  criteriaForm.targetStates.value = toCSV(criteria.targetStates);
  criteriaForm.minContractValue.value = criteria.minContractValue;
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
    fragment.querySelector('.lead-top').textContent = `${lead.source} • Rank ${lead.rank} • Score ${lead.score}`;
    fragment.querySelector('h3').textContent = lead.title;
    fragment.querySelector('.lead-meta').textContent = `${lead.agency} | ${lead.state} | $${lead.contractValue.toLocaleString()} | Due ${lead.dueDate || 'TBD'}`;

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
  const data = await fetchJSON(`/api/leads${query}`);
  leadTitle.textContent = selectedRank ? `Leads in Rank ${selectedRank}` : 'All Leads';
  renderLeads(data.leads);
}

async function loadFunnel() {
  const funnel = await fetchJSON('/api/funnel');
  funnelNode.innerHTML = '';

  funnel
    .sort((a, b) => b.rank - a.rank)
    .forEach((tier) => {
      const tierNode = document.createElement('button');
      tierNode.type = 'button';
      tierNode.className = 'funnel-tier';
      if (selectedRank === tier.rank) tierNode.classList.add('active');
      tierNode.innerHTML = `
        <strong>Rank ${tier.rank} - ${tier.label}</strong><br />
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
    oracleFusionKeywords: fromCSV(criteriaForm.oracleFusionKeywords.value),
    targetAgencies: fromCSV(criteriaForm.targetAgencies.value),
  };
  await fetchJSON('/api/criteria', {
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
