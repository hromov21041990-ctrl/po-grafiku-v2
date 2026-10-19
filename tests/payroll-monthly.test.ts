// Non-mutating monthly payroll regression tests using the real HTML calculation
// and rendering functions with a synthetic in-memory company.
const check = (condition: unknown, label: string) => {
  if (!condition) throw Error(label);
};
for (const file of ['index.html', 'login.html']) {
  Deno.test(file + ': monthly earnings, fines, refunds, paid advance and payment drift', async () => {
    const html = await Deno.readTextFile(new URL('../' + file, import.meta.url));
    const start = html.indexOf('function monthlyRows(){');
    const end = html.indexOf('\nasync function monthlyAction(', start);
    check(start >= 0 && end > start, 'Monthly calculations missing');
    const elements = new Map<string, { value: string; textContent: string; innerHTML: string }>();
    const E = (id: string) => {
      if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '' });
      return elements.get(id)!;
    };
    E('payrollMonth').value = '2026-10';
    const company = {
      employees: ['Анна', 'Борис'],
      schedule: [
        { employee: 'Анна', date: '2026-10-02', pay: 3000 },
        { employee: 'Анна', date: '2026-10-20', pay: 1500 },
        { employee: 'Анна', date: '2026-11-02', pay: 7000 },
        { employee: 'Борис', date: '2026-10-12', pay: 1800 },
      ],
      payments: {
        __fines: {
          '2026-10-05|Анна': 200,
          '2026-10-19|Анна': -50,
          '2026-10-12|Борис': -200,
          '2026-11-02|Анна': 300,
        },
        __advances: {
          '2026-10|Анна': { amount: 1000, at: '2026-10-15T12:00:00Z' },
          '2026-10|Борис': { amount: 500 },
        },
        'salary|2026-10|Анна': { amount: 3350, at: '2026-10-31T12:00:00Z' },
      },
    };
    const api = new Function(
      's', 'E', 'rub', 'esc',
      html.slice(start, end) + '\nreturn {monthlyRows, renderMonthlyPayroll};'
    )(
      company, E, (n: number) => String(n), (v: string) => String(v),
    ) as {
      monthlyRows: () => { month: string; rows: Array<Record<string, any>> };
      renderMonthlyPayroll: () => void;
    };
    let data = api.monthlyRows();
    const anna = data.rows.find(x => x.name === 'Анна')!;
    const boris = data.rows.find(x => x.name === 'Борис')!;
    check(data.month === '2026-10', 'Wrong month');
    check(anna.gross === 4500 && anna.fine === 150, 'Monthly gross / fine error');
    check(anna.advancePaid === 1000 && anna.net === 3350, 'Paid advance not deducted');
    check(boris.fine === -200 && boris.advancePaid === 0 && boris.net === 2000,
      'Refund or unpaid advance error');
    api.renderMonthlyPayroll();
    check(!E('pay').innerHTML.includes('Сумма изменилась после выплаты'),
      'False salary-payment drift warning');
    company.payments.__fines['2026-10-05|Анна'] = 250;
    api.renderMonthlyPayroll();
    check(E('pay').innerHTML.includes('Сумма изменилась после выплаты'),
      'Missing warning after previously marked salary amount changes');
    check(api.monthlyRows().rows.find(x => x.name === 'Анна')!.net === 3300,
      'Fine change did not update net pay');
    E('payrollMonth').value = '2026-11';
    data = api.monthlyRows();
    check(data.rows.find(x => x.name === 'Анна')!.gross === 7000, 'Wrong next-month earnings');
    check(data.rows.find(x => x.name === 'Анна')!.fine === 300, 'Wrong next-month fine');
    check(data.rows.find(x => x.name === 'Анна')!.net === 6700,
      'Current month carryover leaked into next month');
  });
}
