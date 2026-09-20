const webApp = window.Telegram?.WebApp;
const page = document.querySelector('main[data-platform]');
const platform = page.dataset.platform;
const statusNode = document.getElementById('status');
const form = document.getElementById('form');
const saveButton = document.getElementById('save');
const updateButton = document.getElementById('update');
const revokeButton = document.getElementById('revoke');
const initData = webApp?.initData || '';
webApp?.ready();

function backendOrigin() {
  const value = window.VANNADIS_PUBLIC_CONFIG?.backendUrl;
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function callApi(method, path, body) {
  const origin = backendOrigin();
  if (!origin) throw Error('Backend HTTPS indisponível.');
  const response = await fetch(origin + path, {
    method,
    headers: {'X-Telegram-Init-Data': initData, ...(body ? {'Content-Type': 'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    credentials: 'omit',
    mode: 'cors',
    redirect: 'error',
  });
  const result = await response.json();
  if (!response.ok && response.status !== 422) {
    const failure = Error('Falha de autenticação ou serviço indisponível.');
    failure.httpStatus = response.status;
    throw failure;
  }
  return result;
}

function failedOperation(error, invalidMessage) {
  if (!error.httpStatus || error.httpStatus === 401 || error.httpStatus === 403 || error.httpStatus >= 500) {
    statusNode.textContent = 'Backend indisponível ou URL do túnel mudou. Cadastro desabilitado; reabra o Mini App após atualizar config.js.';
    if (form) form.hidden = true;
    if (revokeButton) revokeButton.hidden = true;
  } else {
    statusNode.textContent = invalidMessage;
  }
}

function showState(result) {
  if (platform === 'mercadolivre') {
    statusNode.textContent = result.status === 'manual' ? 'Conversão manual disponível' : 'Indisponível';
    document.getElementById('manual').hidden = result.status !== 'manual';
    return;
  }
  const configured = result.status === 'configured';
  const present = configured || result.status === 'error';
  form.hidden = false;
  saveButton.hidden = present;
  updateButton.hidden = !present;
  revokeButton.hidden = !present;
  if (platform === 'shopee') {
    statusNode.textContent = configured ? 'Configurada' :
      result.status === 'error' ? 'Erro de validação — atualize as credenciais' : 'Não configurada';
  } else {
    document.getElementById('partner-tag').value = result.partner_tag || '';
    statusNode.textContent = configured ? `ID configurado: ${result.partner_tag}` : 'Não configurada';
  }
}

async function refresh() {
  if (!initData) {
    statusNode.textContent = 'Abra esta página pelo botão do bot no Telegram.';
    return;
  }
  if (!backendOrigin()) {
    statusNode.textContent = 'Backend HTTPS indisponível. Cadastro desabilitado; tente novamente mais tarde.';
    if (form) form.hidden = true;
    if (revokeButton) revokeButton.hidden = true;
    if (platform === 'mercadolivre') document.getElementById('manual').hidden = false;
    return;
  }
  try {
    showState(await callApi('GET', `/api/${platform}/status`));
  } catch {
    statusNode.textContent = 'Backend indisponível ou URL do túnel mudou. Cadastro desabilitado; reabra o Mini App após atualizar config.js.';
    if (form) form.hidden = true;
    if (revokeButton) revokeButton.hidden = true;
    if (platform === 'mercadolivre') document.getElementById('manual').hidden = false;
  }
}

if (form) form.addEventListener('submit', async event => {
  event.preventDefault();
  const secretInput = document.getElementById('secret');
  const body = platform === 'shopee' ? {
    app_id: document.getElementById('app-id').value.trim(), secret: secretInput.value,
  } : {partner_tag: document.getElementById('partner-tag').value.trim()};
  try {
    const method = event.submitter?.id === 'update' ? 'PUT' : 'POST';
    const result = await callApi(method, `/api/${platform}`, body);
    showState(result.saved_status ? {status: result.saved_status} : result);
    statusNode.textContent = result.status === 'configured' ? 'Configuração salva para sua conta.' :
      result.saved_status === 'configured' ? 'Novas credenciais não validadas; configuração anterior preservada.' :
      'A Shopee não confirmou as credenciais. Verifique e atualize.';
  } catch (error) {
    failedOperation(error, 'Não foi possível salvar a configuração. Confira os dados informados.');
  } finally {
    if (secretInput) secretInput.value = '';
  }
});

const validateButton = document.getElementById('validate');
if (validateButton) validateButton.addEventListener('click', async () => {
  const secretInput = document.getElementById('secret');
  try {
    const result = await callApi('POST', '/api/shopee/validate', {
      app_id: document.getElementById('app-id').value.trim(), secret: secretInput.value,
    });
    statusNode.textContent = result.status === 'valid' ?
      'Credenciais validadas. Use Salvar ou Atualizar para gravá-las.' :
      'A Shopee não confirmou as credenciais. Nada foi salvo.';
  } catch (error) {
    failedOperation(error, 'Não foi possível validar as credenciais. Confira os dados informados.');
  }
});

if (revokeButton) revokeButton.addEventListener('click', async () => {
  if (!window.confirm(platform === 'shopee' ? 'Revogar suas credenciais Shopee?' : 'Remover seu ID de associado Amazon?')) return;
  try {
    showState(await callApi('DELETE', `/api/${platform}`));
    if (platform === 'shopee') {
      document.getElementById('app-id').value = '';
      document.getElementById('secret').value = '';
    }
  } catch (error) {
    failedOperation(error, 'Não foi possível remover a configuração.');
  }
});

document.getElementById('back').addEventListener('click', () => webApp?.close());
const manualButton = document.getElementById('manual');
if (manualButton) manualButton.addEventListener('click', () => webApp?.close());
refresh();
