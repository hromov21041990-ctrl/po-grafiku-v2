// Regression checks for the real inline login handler without contacting Supabase.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const paths = ['index.html', 'login.html'];
function make(path) {
  const html = fs.readFileSync(path, 'utf8');
  assert.match(html, /id="signinSubmitBtn"[^>]*onclick="login\(\)"/);
  const start = html.indexOf('// Guard against silent/duplicate presses on slow mobile networks.');
  const stop = html.indexOf('function mode(b)', start);
  assert.ok(start > 0 && stop > start, 'The expected login handler must exist in ' + path);
  const snippet = html.slice(start, stop);
  const fields = Object.fromEntries(
    ['error', 'signinSubmitBtn', 'role', 'pass', 'signinCode', 'memberLoginName', 'emailLogin']
      .map(id => [id, { value: '', textContent: '', disabled: false }])
  );
  fields.role.value = 'staff';
  const state = { requests: [], enters: 0, points: 0, signins: 0, pending: null };
  const context = {
    E: id => { assert.ok(fields[id], 'unexpected element ' + id); return fields[id] },
    api: async (name, data) => { state.requests.push({name, data}); if (state.pending) return state.pending; return {token:'test',company:{}} },
    enter: () => { state.enters++ },
    recoveryMode: false,
    loadPoints: async () => {state.points++},
    authErrorText: e => String(e?.message || 'Ошибка входа'),
    setTimeout, clearTimeout,
    sb: { auth: { signInWithPassword: async payload => {state.signins++; return {data: payload, error: null}} } }
  };
  vm.createContext(context);
  vm.runInContext(snippet + ';this.doLogin=login', context);
  return {fields, state, context};
}
(async () => {
  for (const path of paths) {
    const {fields, state, context} = make(path);
    await context.doLogin();
    assert.match(fields.error.textContent, /Заполните ID точки/);
    assert.equal(state.requests.length, 0, 'Missing staff fields must not call backend');
    fields.signinCode.value = 'pg-000001';
    fields.memberLoginName.value = 'test.staff';
    fields.pass.value = 'placeholder-password';
    let settle;
    state.pending = new Promise(resolve => { settle = resolve });
    const first = context.doLogin();
    assert.equal(fields.signinSubmitBtn.disabled, true);
    assert.match(fields.signinSubmitBtn.textContent, /Входим/);
    assert.match(fields.error.textContent, /Проверяем данные/);
    await context.doLogin();
    assert.equal(state.requests.length, 1, 'Second click must not duplicate sign-in');
    settle({token:'test',company:{}});
    await first;
    assert.equal(state.enters, 1);
    assert.equal(fields.signinSubmitBtn.disabled, false);
    assert.equal(fields.signinSubmitBtn.textContent, 'Войти в график →');
    state.pending = Promise.reject(new Error('Сервер недоступен'));
    await context.doLogin();
    assert.match(fields.error.textContent, /Сервер недоступен/);
    assert.equal(fields.signinSubmitBtn.disabled, false, 'Button must unlock after failure');
    fields.role.value = 'owner';
    fields.pass.value = '';
    await context.doLogin();
    assert.match(fields.error.textContent, /Введите email и пароль/);
    assert.equal(state.signins, 0);
    fields.emailLogin.value = 'owner@example.invalid';
    fields.pass.value = 'placeholder-password';
    await context.doLogin();
    assert.equal(state.signins, 1);
    assert.equal(state.points, 1);
    assert.equal(fields.signinSubmitBtn.disabled, false);
    console.log(path + ': staff and owner login validation, progress, retry, success PASS');
  }
})().catch(error => { console.error(error); process.exitCode = 1 });
