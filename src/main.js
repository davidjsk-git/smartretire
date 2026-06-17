import { HyperFormula } from 'hyperformula';
import { SHEET_DATA } from './sheetData.js';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

// Default starting values for simulation to show a rich UI immediately
const DEFAULTS = {
  G2: 50,          // 현재 나이
  G3: 10000,       // 순자산 (1억원)
  G4: 0.06,        // 자산 연 수익률 (6%)
  G5: 3600,        // 연 소비 (3천만원)
  G6: 0.03,        // 연 소비 증가율 (3%)
  G7: 3000,        // 연 수입 (6천만원)
  G8: 0,        // 연 수입 증가율 (3%)
  G9: 70,          // 은퇴 나이 (55세)
  G10: 0,          // 자산 매각 비용 (5%)
  G11: 60,          // 자녀 독립 나이
  G12: 1200,          // 자녀 소비 감소 금액
  G13: 0,          // 불황 주기
  G14: 0,          // 불황 시 하락률
  G16: 0,          // 둠스데이 나이
  G17: 0,          // 둠스데이 하락률
  G18: 0           // 둠스데이 소비 감소율
};

const INPUT_GROUPS = [
  {
    title: "기본 설정 (Core Setup)",
    fields: [
      { addr: "G2", title: "현재 나이", desc: "시작할 나이를 입력하세요" },
      { addr: "G9", title: "은퇴 나이", desc: "수입이 중단되고 은퇴할 나이" },
      { addr: "G3", title: "현재 자산 (만원)", desc: "부채를 제외한 순자산 (퇴직연금 포함, 실거주 부동산 제외)" }
    ]
  },
  {
    title: "성장 및 소비 (Cash Flow)",
    fields: [
      { addr: "G4", title: "자산 연 수익률", desc: "전체 투자 자산의 연 평균 수익률" },
      { addr: "G5", title: "연 소비 금액 (만원)", desc: "1년간 생활비로 지출하는 총 금액" },
      { addr: "G6", title: "연 소비 증가율 (물가)", desc: "매년 지출 증가율 (인플레이션 반영)" },
      { addr: "G7", title: "연 수입 금액 (만원)", desc: "현재 1년간 얻는 연봉 등 순수입" },
      { addr: "G8", title: "연 수입 증가율", desc: "매년 수입의 상승률" },
      { addr: "G10", title: "자산 매각 비용", desc: "은퇴 후 자산 매각 시 수수료 및 세금 %" }
    ]
  },
  {
    title: "가족 계획 (Family)",
    fields: [
      { addr: "G11", title: "자녀 독립 나이", desc: "자녀가 독립할 때 내 나이 (없으면 0)" },
      { addr: "G12", title: "자녀 독립 후 지출 감소액 (만원)", desc: "자녀가 독립하면 감소할 것으로 기대하는 연 소비액" }
    ]
  },
  {
    title: "시장 하락 위기 (Recession Risks)",
    fields: [
      { addr: "G13", title: "불황 주기 (년)", desc: "불황이 몇 년마다 찾아올지 설정 (0이면 없음)" },
      { addr: "G14", title: "불황 시 자산 하락률", desc: "불황이 올 때 자산의 일시적 하락 비중" },
      { addr: "G16", title: "둠스데이 나이", desc: "평생 중 가장 큰 위기(둠스데이)가 올 내 나이 (0이면 없음)" },
      { addr: "G17", title: "둠스데이 하락률", desc: "둠스데이 발생 시 자산 하락폭" },
      { addr: "G18", title: "둠스데이 이후 소비 감소율", desc: "둠스데이 위기 이후 지출을 감축할 비중" }
    ]
  }
];

// Flattens fields for easy address lookup
const ALL_FIELDS = INPUT_GROUPS.reduce((acc, group) => [...acc, ...group.fields], []);
const PERCENT_ADDRS = new Set(['G4', 'G6', 'G8', 'G10', 'G14', 'G17', 'G18']);

// Initialize HyperFormula
const hf = HyperFormula.buildFromArray(SHEET_DATA, {
  licenseKey: 'gpl-v3',
  useArrayArithmetic: true,
});

// Set default values into HyperFormula sheet
Object.entries(DEFAULTS).forEach(([addr, val]) => {
  const [r, c] = addrToRC(addr);
  hf.setCellContents({ sheet: 0, row: r, col: c }, val);
});

let chartInstance = null;

function addrToRC(addr) {
  const m = addr.match(/^([A-Z]+)(\d+)$/);
  const colLetters = m[1];
  const row = parseInt(m[2], 10);
  let col = 0;
  for (let i = 0; i < colLetters.length; i++) {
    col = col * 26 + (colLetters.charCodeAt(i) - 64);
  }
  return [row - 1, col - 1]; // 0-based
}

function parseUserNumber(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (s === '') return null;

  s = s.replace(/,/g, '');

  if (s.endsWith('%')) {
    const num = Number(s.slice(0, -1));
    if (!Number.isFinite(num)) return null;
    return num / 100;
  }

  const num = Number(s);
  if (!Number.isFinite(num)) return null;
  return num;
}

function formatNumberKR(x, maxFrac = 2) {
  if (x === null || x === undefined || x === '') return '';
  if (typeof x !== 'number' || !Number.isFinite(x)) return '';
  return x.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: maxFrac });
}

function formatKoreanCurrency(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (value < 0) return '0원';
  const rounded = Math.round(value);
  if (rounded === 0) return '0원';

  const eok = Math.floor(rounded / 10000);
  const man = rounded % 10000;

  let result = '';
  if (eok > 0) {
    result += `${eok}억 `;
  }
  if (man > 0 || eok === 0) {
    result += `${man.toLocaleString('ko-KR')}만원`;
  }
  return result.trim();
}

function fmtNumber(x) {
  if (x === null || x === undefined || x === '') return '';
  if (typeof x === 'string') return x;
  if (!Number.isFinite(x)) return '';
  const v = Math.round(x);
  return v.toLocaleString('ko-KR');
}

function getCellValue(a1) {
  const [r, c] = addrToRC(a1);
  const v = hf.getCellValue({ sheet: 0, row: r, col: c });
  if (v && typeof v === 'object' && v.value !== undefined) return v.value;
  return v;
}

// Generate the input fields in DOM
function renderInputs() {
  const container = document.getElementById('inputs');
  container.innerHTML = '';

  INPUT_GROUPS.forEach(group => {
    // Header for group
    const groupHeader = document.createElement('div');
    groupHeader.className = 'input-group-title';
    groupHeader.textContent = group.title;
    container.appendChild(groupHeader);

    group.fields.forEach(field => {
      const wrap = document.createElement('div');
      wrap.className = 'field';

      const labelRow = document.createElement('div');
      labelRow.className = 'label-row';

      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = field.title;

      const addrLabel = document.createElement('div');
      addrLabel.className = 'addr';
      addrLabel.textContent = field.addr;

      labelRow.appendChild(label);
      labelRow.appendChild(addrLabel);

      const inputContainer = document.createElement('div');
      inputContainer.className = 'input-container';

      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.className = 'user-editable';

      // Load initial defaults
      const isPercentField = PERCENT_ADDRS.has(field.addr);
      const initialVal = DEFAULTS[field.addr];
      if (initialVal !== undefined && initialVal !== null) {
        if (isPercentField) {
          input.value = `${formatNumberKR(initialVal * 100, 2)}%`;
        } else {
          input.value = formatNumberKR(initialVal, 0);
        }
      }

      const desc = document.createElement('div');
      desc.className = 'desc';
      desc.textContent = field.desc || '';

      input.addEventListener('input', () => {
        const val = parseUserNumber(input.value);
        let finalVal = val;

        if (val !== null && isPercentField && !String(input.value).trim().endsWith('%')) {
          if (Math.abs(val) > 1) finalVal = val / 100;
        }

        const [r, c] = addrToRC(field.addr);
        hf.setCellContents({ sheet: 0, row: r, col: c }, finalVal === null ? null : finalVal);
        recalculateAll();
      });

      input.addEventListener('blur', () => {
        const raw = String(input.value || '').trim();
        if (raw === '') return;

        if (isPercentField) {
          if (raw.endsWith('%')) {
            input.value = raw.replace(/\s+/g, '');
            return;
          }
          const val = parseUserNumber(raw);
          if (val === null) return;
          let displayNum = val;
          if (Math.abs(val) <= 1) displayNum = val * 100;
          input.value = `${formatNumberKR(displayNum, 2)}%`;
        } else {
          const val = parseUserNumber(raw);
          if (val === null) return;
          input.value = formatNumberKR(val, 0);
        }
      });

      inputContainer.appendChild(input);
      wrap.appendChild(labelRow);
      wrap.appendChild(inputContainer);
      if (field.desc) wrap.appendChild(desc);

      container.appendChild(wrap);
    });
  });
}

function recalculateAll() {
  const tableData = [];
  const ages = [];
  const assets = [];
  const spends = [];
  const incomes = [];

  let isFree = true;
  let depletionAge = null;
  let peakAsset = 0;
  let peakAssetAge = 0;
  let retirementAsset = null;
  const retirementAgeInput = getCellValue('G9');

  // Excel rows 2 to 160
  for (let excelRow = 2; excelRow <= 160; excelRow++) {
    const age = getCellValue('A' + excelRow);
    if (typeof age !== 'number' || !Number.isFinite(age)) continue;
    if (age > 100) break;

    const asset = getCellValue('B' + excelRow);
    const spend = getCellValue('C' + excelRow);
    const income = getCellValue('D' + excelRow);

    const assetNum = (typeof asset === 'number' && Number.isFinite(asset)) ? asset : 0;
    const spendNum = (typeof spend === 'number' && Number.isFinite(spend)) ? spend : 0;
    const incomeNum = (typeof income === 'number' && Number.isFinite(income)) ? income : 0;

    // Financial calculations
    if (assetNum < 0 || asset === null || asset === '') {
      if (depletionAge === null) {
        depletionAge = age;
        isFree = false;
      }
    } else {
      if (assetNum > peakAsset) {
        peakAsset = assetNum;
        peakAssetAge = age;
      }
    }

    if (age === retirementAgeInput) {
      retirementAsset = assetNum;
    }

    ages.push(age);
    // Draw negative assets as 0 for chart, but keep track of depletion
    assets.push(assetNum < 0 || asset === null || asset === '' ? 0 : assetNum);
    spends.push(spendNum);
    incomes.push(incomeNum);

    tableData.push({ age, asset, spend, income });
  }

  // Update Summary Dashboard cards
  const freeStatusVal = document.getElementById('metric-status');
  const peakAssetVal = document.getElementById('metric-peak');
  const retireAssetVal = document.getElementById('metric-retire');

  if (isFree) {
    freeStatusVal.innerHTML = `<span style="color: var(--color-asset)">성공 (100세 지속)</span>`;
    freeStatusVal.parentElement.className = 'summary-card success';
  } else {
    freeStatusVal.innerHTML = `<span style="color: var(--color-spend)">${depletionAge}세 고갈 우려</span>`;
    freeStatusVal.parentElement.className = 'summary-card danger';
  }

  peakAssetVal.textContent = `${formatKoreanCurrency(peakAsset)} (${peakAssetAge}세)`;
  retireAssetVal.textContent = retirementAsset !== null ? formatKoreanCurrency(retirementAsset) : '-';

  // Render Table
  renderTableRows(tableData);

  // Render/Update Chart
  renderChart(ages, assets, spends, incomes);
}

function renderTableRows(rows) {
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = '';

  rows.forEach(row => {
    const tr = document.createElement('tr');

    const tdAge = document.createElement('td');
    tdAge.className = 'num';
    tdAge.textContent = fmtNumber(row.age);

    const tdAsset = document.createElement('td');
    tdAsset.className = 'num asset-cell';
    if (typeof row.asset === 'number' && Number.isFinite(row.asset) && row.asset < 0) {
      tdAsset.textContent = '';
    } else {
      tdAsset.textContent = fmtNumber(row.asset);
    }

    const tdSpend = document.createElement('td');
    tdSpend.className = 'num spend-cell';
    tdSpend.textContent = fmtNumber(row.spend);

    const tdIncome = document.createElement('td');
    tdIncome.className = 'num income-cell';
    tdIncome.textContent = fmtNumber(row.income);

    tr.appendChild(tdAge);
    tr.appendChild(tdAsset);
    tr.appendChild(tdSpend);
    tr.appendChild(tdIncome);

    tbody.appendChild(tr);
  });
}

function renderChart(labels, assets, spends, incomes) {
  const ctx = document.getElementById('simulatorChart').getContext('2d');

  if (chartInstance) {
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = assets;
    chartInstance.data.datasets[1].data = spends;
    chartInstance.data.datasets[2].data = incomes;
    chartInstance.update('none'); // Update without animation for smooth slider feel
    return;
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '내 자산 (만원)',
          data: assets,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.05)',
          borderWidth: 3,
          fill: true,
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          label: '연 소비 (만원)',
          data: spends,
          borderColor: '#f43f5e',
          borderWidth: 2,
          borderDash: [5, 5],
          fill: false,
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          label: '연 수입 (만원)',
          data: incomes,
          borderColor: '#f59e0b',
          borderWidth: 2,
          fill: false,
          tension: 0.3,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: {
              family: 'Plus Jakarta Sans',
              size: 12
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleFont: { family: 'Outfit', size: 14, weight: 'bold' },
          bodyFont: { family: 'Plus Jakarta Sans', size: 13 },
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.03)'
          },
          ticks: {
            color: '#64748b',
            font: { family: 'Outfit' }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#64748b',
            font: { family: 'Outfit' },
            callback: function (value) {
              if (value >= 10000) {
                return (value / 10000) + '억';
              }
              return value.toLocaleString() + '만';
            }
          }
        }
      }
    }
  });
}

// Initial Run
renderInputs();
recalculateAll();
