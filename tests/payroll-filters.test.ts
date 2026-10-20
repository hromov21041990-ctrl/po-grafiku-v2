// Regression: the monthly salary screen must show the month picker,
// while the weekly screen must show the week picker. This runs the real
// renderPayroll() function from both published HTML entry points.
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

for (const filename of ['index.html', 'login.html']) {
  Deno.test(filename + ': payroll period selectors match payroll mode', async () => {
    const html = await Deno.readTextFile(new URL('../' + filename, import.meta.url));
    const start = html.indexOf('function renderPayroll(){');
    const end = html.indexOf('\nfunction exportPayroll(){', start);
    assert(start !== -1 && end !== -1, 'Cannot locate renderPayroll() in ' + filename);
    const code = html.slice(start, end) + '\nreturn renderPayroll;';

    for (const monthly of [false, true]) {
      const elements = new Map<string, any>();
      const element = (id: string) => {
        if (!elements.has(id)) {
          const classes = new Set<string>();
          elements.set(id, {
            classList: {
              toggle(name: string, force: boolean) {
                if (force) classes.add(name);
                else classes.delete(name);
              },
              contains(name: string) { return classes.has(name); },
            },
            value: '',
            textContent: '',
            innerHTML: '',
          });
        }
        return elements.get(id);
      };
      let monthlyRenderCount = 0;
      const state = { role: 'owner', config: { payrollMode: monthly ? 'monthly' : 'weekly' }, payments: {} };
      const render = new Function(
        's', 'E', 'renderMonthlyPayroll', 'payrollData', 'rub', 'esc', code
      )(
        state,
        element,
        () => { monthlyRenderCount++; },
        () => ({ rows: [], all: false, from: '2026-10-19', end: '2026-10-25' }),
        (v: number) => v.toFixed(2),
        (v: string) => v,
      ) as () => void;

      render();
      assert(element('payrollMonthBox').classList.contains('hide') === !monthly,
        filename + ': month picker incorrectly shown in ' + (monthly ? 'monthly' : 'weekly') + ' mode');
      assert(element('payrollWeekBox').classList.contains('hide') === monthly,
        filename + ': week picker incorrectly shown in ' + (monthly ? 'monthly' : 'weekly') + ' mode');
      assert(element('payrollModeQuick').value === (monthly ? 'monthly' : 'weekly'),
        filename + ': quick mode selector is wrong');
      assert(monthlyRenderCount === (monthly ? 1 : 0),
        filename + ': monthly table render should run in monthly mode only');
    }
  });
}
