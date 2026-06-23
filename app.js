// ===== roundRect polyfill =====
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === 'number') r = [r, r, r, r];
    var tl = r[0] || 0, tr = r[1] || r[0] || 0, br = r[2] || r[0] || 0, bl = r[3] || r[1] || r[0] || 0;
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
    return this;
  };
}

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./sw.js').catch(function() {});
  });
}

// ===== Data =====
var DATA_VERSION = 3;

function loadData() {
  try {
    var raw = localStorage.getItem('vistoria_data');
    if (!raw) return { version: DATA_VERSION, projetos: [] };
    var parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== DATA_VERSION) {
      localStorage.removeItem('vistoria_data');
      return { version: DATA_VERSION, projetos: [] };
    }
    if (!parsed.projetos) parsed.projetos = [];
    return parsed;
  } catch (e) {
    localStorage.removeItem('vistoria_data');
    return { version: DATA_VERSION, projetos: [] };
  }
}

function saveData(data) {
  data.version = DATA_VERSION;
  localStorage.setItem('vistoria_data', JSON.stringify(data));
}

var appData = loadData();
var currentProjetoId = null;
var currentAmbienteId = null;
var currentFotoId = null;
var currentRenameId = null;
var currentRenameType = null;
var currentDeleteId = null;
var currentDeleteType = null;
var navigationStack = [];

// ===== DOM Cache =====
var $ = function(id) { return document.getElementById(id); };
var elBtnBack = $('btn-back');
var elListaProjetos = $('lista-projetos');
var elListaAmbientes = $('lista-ambientes');
var elListaFotos = $('lista-fotos');
var elProjetoInfo = $('projeto-info');
var elAmbienteInfo = $('ambiente-info');
var elCanvas = $('photo-canvas');
var elCanvasHint = $('canvas-hint');
var elOfflineBadge = $('offline-badge');

// ===== Helpers =====
var escDiv = document.createElement('div');
function esc(str) {
  escDiv.textContent = str;
  return escDiv.innerHTML;
}

function hideScreens() {
  var screens = document.querySelectorAll('.screen');
  for (var i = 0; i < screens.length; i++) {
    screens[i].classList.remove('active');
  }
}

// ===== iOS standalone detection =====
var isStandalone = (window.navigator.standalone === true) || (window.matchMedia('(display-mode: standalone)').matches);

// ===== Navigation =====
function navigateTo(screenId) {
  var active = document.querySelector('.screen.active');
  if (active) navigationStack.push(active.id);
  hideScreens();
  $(screenId).classList.add('active');
  elBtnBack.classList.toggle('hidden', navigationStack.length === 0);
  document.querySelector('.app-main').scrollTop = 0;
}

function goBack() {
  var prev = navigationStack.pop();
  if (!prev) return;
  hideScreens();
  $(prev).classList.add('active');
  elBtnBack.classList.toggle('hidden', navigationStack.length === 0);
  if (prev === 'screen-projetos') renderProjetos();
  else if (prev === 'screen-ambientes') renderAmbientes();
  else if (prev === 'screen-fotos') renderFotos();
}

function goHome() {
  navigationStack = [];
  hideScreens();
  $('screen-projetos').classList.add('active');
  elBtnBack.classList.add('hidden');
  renderProjetos();
}

// ===== Overlays =====
function showOverlay(id) {
  $(id).classList.remove('hidden');
}

function hideOverlay(id) {
  $(id).classList.add('hidden');
}

function showAlert(msg) {
  $('alert-msg').textContent = msg;
  showOverlay('alert-overlay');
}

// ===== Offline =====
function updateOnlineStatus() {
  elOfflineBadge.classList.toggle('hidden', navigator.onLine);
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ===== Find Helpers =====
function findProjetoById(id) {
  for (var i = 0; i < appData.projetos.length; i++) {
    if (appData.projetos[i].id === id) return appData.projetos[i];
  }
  return null;
}

function findProjeto() {
  return findProjetoById(currentProjetoId);
}

function findAmbienteById(proj, id) {
  if (!proj) return null;
  for (var i = 0; i < proj.ambientes.length; i++) {
    if (proj.ambientes[i].id === id) return proj.ambientes[i];
  }
  return null;
}

function findAmbiente() {
  return findAmbienteById(findProjeto(), currentAmbienteId);
}

function findFotoById(amb, id) {
  if (!amb) return null;
  for (var i = 0; i < amb.fotos.length; i++) {
    if (amb.fotos[i].id === id) return amb.fotos[i];
  }
  return null;
}

function findFoto() {
  return findFotoById(findAmbiente(), currentFotoId);
}

function countTotalFotos(p) {
  var total = 0;
  for (var j = 0; j < p.ambientes.length; j++) {
    total += p.ambientes[j].fotos.length;
  }
  return total;
}

function countAnotacoes(a) {
  var count = 0;
  for (var j = 0; j < a.fotos.length; j++) {
    count += a.fotos[j].anotacoes.length;
  }
  return count;
}

// ===== TELA 1: Projetos =====
function renderProjetos() {
  if (appData.projetos.length === 0) {
    elListaProjetos.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">&#128221;</div>' +
        '<p>Nenhum projeto ainda.<br>Comece criando um novo projeto.</p>' +
      '</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < appData.projetos.length; i++) {
    var p = appData.projetos[i];
    var totalFotos = countTotalFotos(p);
    html +=
      '<div class="card" onclick="openProjeto(' + p.id + ')">' +
        '<div class="card-actions">' +
          '<button class="btn-icon" onclick="event.stopPropagation(); renameProjeto(' + p.id + ')" title="Renomear">&#9998;</button>' +
          '<button class="btn-delete-card" onclick="event.stopPropagation(); deleteProjeto(' + p.id + ')">&#128465;</button>' +
        '</div>' +
        '<h3>' + esc(p.nome) + '</h3>' +
        '<div class="card-meta">' +
          '<span>' + p.data + '</span>' +
          '<span>' + p.ambientes.length + ' ambiente(s) &middot; ' + totalFotos + ' foto(s)</span>' +
        '</div>' +
        (p.endereco ? '<div class="card-meta" style="margin-top:4px"><span>' + esc(p.endereco) + '</span></div>' : '') +
      '</div>';
  }
  elListaProjetos.innerHTML = html;
}

function showNewProjectForm() {
  $('input-nome-projeto').value = '';
  $('input-endereco-projeto').value = '';
  showOverlay('form-projeto-overlay');
  $('input-nome-projeto').focus();
}

function createProject() {
  var nome = $('input-nome-projeto').value.trim();
  if (!nome) return;
  appData.projetos.unshift({
    id: Date.now(),
    nome: nome,
    endereco: $('input-endereco-projeto').value.trim(),
    data: new Date().toLocaleDateString('pt-BR'),
    ambientes: []
  });
  saveData(appData);
  hideOverlay('form-projeto-overlay');
  renderProjetos();
}

function deleteProjeto(id) {
  currentDeleteId = id;
  currentDeleteType = 'projeto';
  var p = findProjetoById(id);
  if (!p) return;
  $('delete-title').textContent = 'Excluir projeto';
  $('delete-msg').textContent = 'Excluir "' + p.nome + '" e todos os ambientes e fotos?';
  showOverlay('delete-overlay');
}

function confirmDelete() {
  if (currentDeleteType === 'projeto') {
    appData.projetos = appData.projetos.filter(function(p) { return p.id !== currentDeleteId; });
    saveData(appData);
    hideOverlay('delete-overlay');
    renderProjetos();
  } else if (currentDeleteType === 'ambiente') {
    var p = findProjeto();
    if (!p) { hideOverlay('delete-overlay'); return; }
    p.ambientes = p.ambientes.filter(function(a) { return a.id !== currentDeleteId; });
    saveData(appData);
    hideOverlay('delete-overlay');
    renderAmbientes();
  } else if (currentDeleteType === 'foto') {
    var a = findAmbiente();
    if (!a) { hideOverlay('delete-overlay'); return; }
    a.fotos = a.fotos.filter(function(f) { return f.id !== currentDeleteId; });
    saveData(appData);
    hideOverlay('delete-overlay');
    var top = navigationStack[navigationStack.length - 1];
    if (top === 'screen-anotacao') {
      navigationStack.pop();
      goBack();
    } else {
      renderFotos();
    }
  }
}

function openProjeto(id) {
  currentProjetoId = id;
  var p = findProjeto();
  if (!p) return;
  elProjetoInfo.innerHTML =
    '<h2>' + esc(p.nome) + '</h2>' +
    '<p>' + (p.endereco ? esc(p.endereco) + ' &middot; ' : '') + p.data + ' &middot; ' + p.ambientes.length + ' ambiente(s) &middot; ' + countTotalFotos(p) + ' foto(s)</p>';
  renderAmbientes();
  navigateTo('screen-ambientes');
}

function renameProjeto(id) {
  currentRenameId = id;
  currentRenameType = 'projeto';
  var p = findProjetoById(id);
  if (!p) return;
  $('rename-title').textContent = 'Renomear projeto';
  $('input-rename').value = p.nome;
  showOverlay('rename-overlay');
  $('input-rename').focus();
  $('input-rename').select();
}

function renameAmbiente(id) {
  currentRenameId = id;
  currentRenameType = 'ambiente';
  var a = findAmbienteById(findProjeto(), id);
  if (!a) return;
  $('rename-title').textContent = 'Renomear ambiente';
  $('input-rename').value = a.nome;
  showOverlay('rename-overlay');
  $('input-rename').focus();
  $('input-rename').select();
}

function confirmRename() {
  var nome = $('input-rename').value.trim();
  if (!nome) return;
  hideOverlay('rename-overlay');
  if (currentRenameType === 'projeto') {
    var p = findProjetoById(currentRenameId);
    if (!p) return;
    p.nome = nome;
    saveData(appData);
    renderProjetos();
  } else if (currentRenameType === 'ambiente') {
    var a = findAmbienteById(findProjeto(), currentRenameId);
    if (!a) return;
    a.nome = nome;
    saveData(appData);
    renderAmbientes();
    elAmbienteInfo.innerHTML =
      '<h2>' + esc(a.nome) + '</h2>' +
      '<p>' + a.fotos.length + ' foto(s)</p>';
  }
}

// ===== TELA 2: Ambientes =====
function renderAmbientes() {
  var p = findProjeto();
  if (!p) return;
  if (p.ambientes.length === 0) {
    elListaAmbientes.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">&#127968;</div>' +
        '<p>Nenhum ambiente adicionado.</p>' +
      '</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < p.ambientes.length; i++) {
    var a = p.ambientes[i];
    html +=
      '<div class="card" onclick="openAmbiente(' + a.id + ')">' +
        '<div class="card-actions">' +
          '<button class="btn-icon" onclick="event.stopPropagation(); renameAmbiente(' + a.id + ')" title="Renomear">&#9998;</button>' +
          '<button class="btn-delete-card" onclick="event.stopPropagation(); deleteAmbiente(' + a.id + ')">&#128465;</button>' +
        '</div>' +
        '<h3>' + esc(a.nome) + '</h3>' +
        '<div class="card-meta">' +
          '<span>' + a.fotos.length + ' foto(s)</span>' +
          '<span class="card-badge">' + countAnotacoes(a) + ' anotacao(es)</span>' +
        '</div>' +
      '</div>';
  }
  elListaAmbientes.innerHTML = html;
}

function showNewAmbienteForm() {
  $('input-nome-ambiente').value = '';
  showOverlay('form-ambiente-overlay');
  $('input-nome-ambiente').focus();
}

function createAmbiente() {
  var nome = $('input-nome-ambiente').value.trim();
  if (!nome) return;
  var p = findProjeto();
  if (!p) return;
  p.ambientes.push({ id: Date.now(), nome: nome, fotos: [] });
  saveData(appData);
  hideOverlay('form-ambiente-overlay');
  renderAmbientes();
}

function deleteAmbiente(id) {
  currentDeleteId = id;
  currentDeleteType = 'ambiente';
  var a = findAmbienteById(findProjeto(), id);
  if (!a) return;
  $('delete-title').textContent = 'Excluir ambiente';
  $('delete-msg').textContent = 'Excluir "' + a.nome + '" e todas as fotos?';
  showOverlay('delete-overlay');
}

function deleteFoto(id) {
  currentDeleteId = id;
  currentDeleteType = 'foto';
  $('delete-title').textContent = 'Excluir foto';
  $('delete-msg').textContent = 'Excluir esta foto e todas as anotacoes?';
  showOverlay('delete-overlay');
}

function openAmbiente(id) {
  currentAmbienteId = id;
  var a = findAmbiente();
  if (!a) return;
  elAmbienteInfo.innerHTML =
    '<h2>' + esc(a.nome) + '</h2>' +
    '<p>' + a.fotos.length + ' foto(s)</p>';
  renderFotos();
  navigateTo('screen-fotos');
}

// ===== TELA 3: Fotos =====
function renderFotos() {
  var a = findAmbiente();
  if (!a) return;
  if (a.fotos.length === 0) {
    elListaFotos.innerHTML =
      '<div class="photo-empty">' +
        '<div class="empty-icon">&#128247;</div>' +
        '<p>Nenhuma foto tirada ainda.</p>' +
      '</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < a.fotos.length; i++) {
    var f = a.fotos[i];
    html +=
      '<div class="photo-thumb">' +
        '<img src="' + f.src + '" alt="Foto" loading="lazy" onclick="openAnotacao(' + f.id + ')">' +
        '<button class="photo-delete-btn" onclick="event.stopPropagation(); deleteFoto(' + f.id + ')" title="Excluir foto">&#10005;</button>' +
        (f.anotacoes.length > 0 ? '<span class="photo-count">' + f.anotacoes.length + '</span>' : '') +
      '</div>';
  }
  elListaFotos.innerHTML = html;
}

$('input-foto').addEventListener('change', handlePhoto);
$('input-foto-galeria').addEventListener('change', handlePhoto);

function handlePhoto(e) {
  var files = e.target.files;
  var a = findAmbiente();
  if (!a) return;
  var pending = files.length;
  var errors = 0;
  for (var i = 0; i < files.length; i++) {
    (function(file) {
      compressAndRead(file, function(dataUrl) {
        a.fotos.push({
          id: Date.now() + Math.random(),
          src: dataUrl,
          anotacoes: []
        });
        saveData(appData);
        pending--;
        if (pending <= 0) {
          renderFotos();
          updateAmbienteInfo();
          if (errors > 0) showAlert(errors + ' foto(s) nao puderam ser salvas.');
        }
      }, function() {
        pending--;
        errors++;
        if (pending <= 0) {
          renderFotos();
          updateAmbienteInfo();
          if (errors > 0) showAlert(errors + ' foto(s) nao puderam ser salvas.');
        }
      });
    })(files[i]);
  }
  e.target.value = '';
}

function compressAndRead(file, onSuccess, onError) {
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      var maxDim = 2048;
      var w = img.width;
      var h = img.height;
      if (w > maxDim || h > maxDim) {
        var ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      try {
        var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        onSuccess(dataUrl);
      } catch (err) {
        onError();
      }
    };
    img.onerror = function() { onError(); };
    img.src = ev.target.result;
  };
  reader.onerror = function() { onError(); };
  reader.readAsDataURL(file);
}

function updateAmbienteInfo() {
  var a = findAmbiente();
  if (!a) return;
  elAmbienteInfo.innerHTML =
    '<h2>' + esc(a.nome) + '</h2>' +
    '<p>' + a.fotos.length + ' foto(s)</p>';
}

// ===== TELA 4: Anotacao =====
var currentTool = 'medir';
var isDragging = false;
var dragStart = null;
var dragCurrent = null;
var pendingLine = null;
var canvasCtx = null;
var canvasImg = null;
var selectedUnit = 'cm';
var editingIndex = -1;

function selectUnit(unit) {
  selectedUnit = unit;
  var btns = document.querySelectorAll('.unit-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-unit') === unit);
  }
}

function setTool(tool) {
  currentTool = tool;
  isDragging = false;
  dragStart = null;
  dragCurrent = null;
  var btns = document.querySelectorAll('.tool-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.remove('active');
  }
  $('tool-' + tool).classList.add('active');
  updateHint();
  drawCanvas();
}

function updateHint() {
  if (currentTool === 'medir') {
    elCanvasHint.textContent = isDragging ? 'Solte para finalizar' : 'Pressione e arraste para medir';
  } else if (currentTool === 'nota') {
    elCanvasHint.textContent = 'Toque onde deseja colocar a nota';
  } else if (currentTool === 'editar') {
    elCanvasHint.textContent = 'Toque em uma anotacao para editar';
  } else {
    elCanvasHint.textContent = 'Toque em uma anotacao para apaga-la';
  }
}

function openAnotacao(fotoId) {
  currentFotoId = fotoId;
  currentTool = 'medir';
  isDragging = false;
  dragStart = null;
  dragCurrent = null;
  var btns = document.querySelectorAll('.tool-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.remove('active');
  }
  $('tool-medir').classList.add('active');
  navigateTo('screen-anotacao');
  setTimeout(initCanvas, 50);
}

function initCanvas() {
  var foto = findFoto();
  if (!foto) return;

  if (canvasImg && canvasImg.src === foto.src) {
    resizeAndDraw();
    return;
  }

  var img = new Image();
  img.onload = function() {
    canvasImg = img;
    canvasCtx = $('photo-canvas').getContext('2d');
    resizeAndDraw();
  };
  img.src = foto.src;
}

function resizeAndDraw() {
  var container = $('canvas-container');
  var img = canvasImg;
  var maxW = container.clientWidth;
  var ratio = img.height / img.width;
  var w = Math.min(img.width, maxW);
  var h = w * ratio;
  var dpr = window.devicePixelRatio || 1;

  elCanvas.width = Math.round(w * dpr);
  elCanvas.height = Math.round(h * dpr);
  elCanvas.style.width = w + 'px';
  elCanvas.style.height = h + 'px';

  drawCanvas();
}

function drawCanvas() {
  if (!canvasCtx || !canvasImg) return;
  var ctx = canvasCtx;
  var w = elCanvas.width;
  var h = elCanvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(canvasImg, 0, 0, w, h);

  var foto = findFoto();
  if (!foto) return;

  for (var j = 0; j < foto.anotacoes.length; j++) {
    var ann = foto.anotacoes[j];
    if (ann.type === 'line') {
      drawLine(ctx, ann.x1 * w, ann.y1 * h, ann.x2 * w, ann.y2 * h, ann.medida);
    } else if (ann.type === 'note') {
      drawNote(ctx, ann.x * w, ann.y * h, ann.texto);
    }
  }

  if (isDragging && dragStart && dragCurrent) {
    drawDragLine(ctx, dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y);
  }

  updateHint();
}

function drawArrowShape(ctx, ax, ay, aAngle, arrowLen, arrowW) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - arrowLen * Math.cos(aAngle) + arrowW * Math.sin(aAngle), ay - arrowLen * Math.sin(aAngle) - arrowW * Math.cos(aAngle));
  ctx.lineTo(ax - arrowLen * Math.cos(aAngle) - arrowW * Math.sin(aAngle), ay - arrowLen * Math.sin(aAngle) + arrowW * Math.cos(aAngle));
  ctx.closePath();
  ctx.fill();
}

function drawLine(ctx, x1, y1, x2, y2, text) {
  var dpr = window.devicePixelRatio || 1;
  ctx.save();

  var angle = Math.atan2(y2 - y1, x2 - x1);
  var arrowLen = 22 * dpr;
  var arrowW = 9 * dpr;
  var lineShorten = arrowLen * 0.3;

  var lx1 = x1 + lineShorten * Math.cos(angle);
  var ly1 = y1 + lineShorten * Math.sin(angle);
  var lx2 = x2 - lineShorten * Math.cos(angle);
  var ly2 = y2 - lineShorten * Math.sin(angle);

  var mx = (x1 + x2) / 2;
  var my = (y1 + y2) / 2;
  var dist = Math.hypot(x2 - x1, y2 - y1);
  var fontSize = Math.max(12, Math.min(40, dist * 0.12)) * dpr;
  ctx.font = 'bold ' + fontSize + 'px -apple-system, sans-serif';
  var metrics = ctx.measureText(text);
  var textW = metrics.width + fontSize * 0.4;
  var halfGap = textW / 2;

  var gapStartX = mx - halfGap * Math.cos(angle);
  var gapStartY = my - halfGap * Math.sin(angle);
  var gapEndX = mx + halfGap * Math.cos(angle);
  var gapEndY = my + halfGap * Math.sin(angle);

  ctx.strokeStyle = '#ff3b30';
  ctx.lineWidth = 6 * dpr;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(lx1, ly1);
  ctx.lineTo(gapStartX, gapStartY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(gapEndX, gapEndY);
  ctx.lineTo(lx2, ly2);
  ctx.stroke();

  ctx.fillStyle = '#ff3b30';
  drawArrowShape(ctx, x1, y1, angle + Math.PI, arrowLen, arrowW);
  drawArrowShape(ctx, x2, y2, angle, arrowLen, arrowW);

  ctx.translate(mx, my);
  ctx.rotate(angle);
  ctx.fillStyle = '#ff3b30';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawNote(ctx, x, y, text) {
  var dpr = window.devicePixelRatio || 1;
  ctx.save();
  var fontSize = 12 * dpr;
  ctx.font = fontSize + 'px -apple-system, sans-serif';
  var lines = text.split('\n');
  var lineHeight = fontSize * 1.3;
  var maxLineW = 0;
  for (var i = 0; i < lines.length; i++) {
    var lw = ctx.measureText(lines[i]).width;
    if (lw > maxLineW) maxLineW = lw;
  }
  var pad = 6 * dpr;
  var bgW = maxLineW + pad * 2;
  var bgH = lines.length * lineHeight + pad * 2;

  ctx.fillStyle = 'rgba(255,204,0,0.92)';
  ctx.beginPath();
  ctx.roundRect(x - pad, y - bgH, bgW, bgH, 4 * dpr);
  ctx.fill();

  ctx.fillStyle = '#000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (var j = 0; j < lines.length; j++) {
    ctx.fillText(lines[j], x, y - bgH + pad + j * lineHeight);
  }
  ctx.restore();
}

function drawDragLine(ctx, x1, y1, x2, y2) {
  var dpr = window.devicePixelRatio || 1;
  ctx.save();

  var angle = Math.atan2(y2 - y1, x2 - x1);
  var arrowLen = 20 * dpr;
  var arrowW = 8 * dpr;
  var lineShorten = arrowLen * 0.3;

  var lx1 = x1 + lineShorten * Math.cos(angle);
  var ly1 = y1 + lineShorten * Math.sin(angle);
  var lx2 = x2 - lineShorten * Math.cos(angle);
  var ly2 = y2 - lineShorten * Math.sin(angle);

  ctx.strokeStyle = 'rgba(255,59,48,0.7)';
  ctx.lineWidth = 5 * dpr;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(lx1, ly1);
  ctx.lineTo(lx2, ly2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,59,48,0.7)';
  drawArrowShape(ctx, x1, y1, angle + Math.PI, arrowLen, arrowW);
  drawArrowShape(ctx, x2, y2, angle, arrowLen, arrowW);

  ctx.restore();
}

function getCanvasPos(e) {
  var rect = elCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * elCanvas.width / rect.width,
    y: (e.clientY - rect.top) * elCanvas.height / rect.height
  };
}

// ===== Canvas Events =====
elCanvas.addEventListener('pointerdown', onPointerDown);
elCanvas.addEventListener('pointermove', onPointerMove);
elCanvas.addEventListener('pointerup', onPointerUp);
elCanvas.addEventListener('pointerleave', onPointerUp);

function onPointerDown(e) {
  e.preventDefault();
  elCanvas.setPointerCapture(e.pointerId);
  var pos = getCanvasPos(e);

  if (currentTool === 'medir') {
    isDragging = true;
    dragStart = pos;
    dragCurrent = pos;
    drawCanvas();
  } else if (currentTool === 'nota') {
    pendingLine = { x: pos.x, y: pos.y };
    showOverlay('nota-overlay');
    $('input-nota').value = '';
    $('input-nota').focus();
  } else if (currentTool === 'apagar') {
    deleteAnnotationAt(pos);
  } else if (currentTool === 'editar') {
    editAnnotationAt(pos);
  }
}

function onPointerMove(e) {
  if (!isDragging) return;
  e.preventDefault();
  dragCurrent = getCanvasPos(e);
  drawCanvas();
}

function onPointerUp() {
  if (!isDragging) return;
  isDragging = false;

  if (!dragStart || !dragCurrent) return;
  var dpr = window.devicePixelRatio || 1;
  if (Math.hypot(dragCurrent.x - dragStart.x, dragCurrent.y - dragStart.y) < 10 * dpr) {
    dragStart = null;
    dragCurrent = null;
    drawCanvas();
    return;
  }

  pendingLine = { x1: dragStart.x, y1: dragStart.y, x2: dragCurrent.x, y2: dragCurrent.y };
  dragStart = null;
  dragCurrent = null;

  showOverlay('medida-overlay');
  $('input-medida').value = '';
  $('input-medida').focus();
}

function getNoteCenter(ann, w, h, dpr) {
  var fontSize = 12 * dpr;
  var lines = ann.texto.split('\n');
  var lineHeight = fontSize * 1.3;
  var pad = 6 * dpr;

  var canvas2 = document.createElement('canvas');
  var ctx2 = canvas2.getContext('2d');
  ctx2.font = fontSize + 'px -apple-system, sans-serif';
  var maxLineW = 0;
  for (var i = 0; i < lines.length; i++) {
    var lw = ctx2.measureText(lines[i]).width;
    if (lw > maxLineW) maxLineW = lw;
  }

  var bgW = maxLineW + pad * 2;
  var bgH = lines.length * lineHeight + pad * 2;
  var px = ann.x * w;
  var py = ann.y * h;

  return {
    x: px - pad + bgW / 2,
    y: py - bgH / 2,
    w: bgW,
    h: bgH
  };
}

function deleteAnnotationAt(pos) {
  var foto = findFoto();
  if (!foto) return;

  var w = elCanvas.width;
  var h = elCanvas.height;
  var dpr = window.devicePixelRatio || 1;
  var threshold = 40 * dpr;
  var closest = -1;
  var closestDist = Infinity;

  for (var j = 0; j < foto.anotacoes.length; j++) {
    var ann = foto.anotacoes[j];
    var d;
    if (ann.type === 'line') {
      d = distToSegment(pos, { x: ann.x1 * w, y: ann.y1 * h }, { x: ann.x2 * w, y: ann.y2 * h });
    } else {
      var nc = getNoteCenter(ann, w, h, dpr);
      d = Math.hypot(pos.x - nc.x, pos.y - nc.y);
    }
    if (d < threshold && d < closestDist) {
      closestDist = d;
      closest = j;
    }
  }
  if (closest >= 0) {
    foto.anotacoes.splice(closest, 1);
    saveData(appData);
    drawCanvas();
  }
}

function editAnnotationAt(pos) {
  var foto = findFoto();
  if (!foto) return;

  var w = elCanvas.width;
  var h = elCanvas.height;
  var dpr = window.devicePixelRatio || 1;
  var threshold = 40 * dpr;
  var closest = -1;
  var closestDist = Infinity;

  for (var j = 0; j < foto.anotacoes.length; j++) {
    var ann = foto.anotacoes[j];
    var d;
    if (ann.type === 'line') {
      d = distToSegment(pos, { x: ann.x1 * w, y: ann.y1 * h }, { x: ann.x2 * w, y: ann.y2 * h });
    } else {
      var nc = getNoteCenter(ann, w, h, dpr);
      d = Math.hypot(pos.x - nc.x, pos.y - nc.y);
    }
    if (d < threshold && d < closestDist) {
      closestDist = d;
      closest = j;
    }
  }

  if (closest < 0) return;

  editingIndex = closest;
  var ann = foto.anotacoes[closest];

  if (ann.type === 'line') {
    var unitSuffix = ann.medida.replace(/[0-9.,]/g, '');
    if (unitSuffix === 'mm' || unitSuffix === 'cm' || unitSuffix === 'm') {
      selectedUnit = unitSuffix;
      var unitBtns = document.querySelectorAll('.unit-btn');
      for (var i = 0; i < unitBtns.length; i++) {
        unitBtns[i].classList.toggle('active', unitBtns[i].getAttribute('data-unit') === selectedUnit);
      }
    }
    $('input-medida').value = ann.medida.replace(/[a-zA-Z]+$/, '');
    showOverlay('medida-overlay');
    $('input-medida').focus();
    $('input-medida').select();
  } else if (ann.type === 'note') {
    $('input-nota').value = ann.texto;
    showOverlay('nota-overlay');
    $('input-nota').focus();
  }
}

function distToSegment(p, a, b) {
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  var len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  var t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ===== Medida =====
function confirmMedida() {
  var value = $('input-medida').value.trim();
  if (!value) { hideOverlay('medida-overlay'); return; }
  var foto = findFoto();
  if (!foto) { hideOverlay('medida-overlay'); return; }
  var text = value + selectedUnit;

  if (editingIndex >= 0) {
    foto.anotacoes[editingIndex].medida = text;
    editingIndex = -1;
  } else if (pendingLine) {
    foto.anotacoes.push({
      type: 'line',
      x1: pendingLine.x1 / elCanvas.width,
      y1: pendingLine.y1 / elCanvas.height,
      x2: pendingLine.x2 / elCanvas.width,
      y2: pendingLine.y2 / elCanvas.height,
      medida: text
    });
    pendingLine = null;
  } else {
    hideOverlay('medida-overlay');
    return;
  }

  saveData(appData);
  hideOverlay('medida-overlay');
  drawCanvas();
}

function cancelMedida() {
  pendingLine = null;
  editingIndex = -1;
  hideOverlay('medida-overlay');
  drawCanvas();
}

// ===== Nota =====
function confirmNota() {
  var text = $('input-nota').value.trim();
  if (!text) { hideOverlay('nota-overlay'); return; }
  var foto = findFoto();
  if (!foto) { hideOverlay('nota-overlay'); return; }

  if (editingIndex >= 0) {
    foto.anotacoes[editingIndex].texto = text;
    editingIndex = -1;
  } else if (pendingLine) {
    foto.anotacoes.push({
      type: 'note',
      x: pendingLine.x / elCanvas.width,
      y: pendingLine.y / elCanvas.height,
      texto: text
    });
    pendingLine = null;
  } else {
    hideOverlay('nota-overlay');
    return;
  }

  saveData(appData);
  hideOverlay('nota-overlay');
  drawCanvas();
}

function cancelNota() {
  pendingLine = null;
  editingIndex = -1;
  hideOverlay('nota-overlay');
  drawCanvas();
}

function deleteCurrentPhoto() {
  currentDeleteId = currentFotoId;
  currentDeleteType = 'foto';
  $('delete-title').textContent = 'Excluir foto';
  $('delete-msg').textContent = 'Excluir esta foto e todas as anotacoes?';
  showOverlay('delete-overlay');
}

// ===== PDF Export =====
function exportPDF() {
  var p = findProjeto();
  if (!p || countTotalFotos(p) === 0) {
    showAlert('Nenhuma foto para exportar.');
    return;
  }
  showOverlay('pdf-loading');
  setTimeout(function() { doExportPDF(p); }, 100);
}

function doExportPDF(p) {
  try {
    var jsPDF = window.jspdf.jsPDF;
    var pdf = new jsPDF('p', 'mm', 'a4');
    var pageW = 210;
    var pageH = 297;
    var margin = 15;
    var contentW = pageW - margin * 2;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(28);
    pdf.text(p.nome, pageW / 2, 80, { align: 'center' });
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'normal');
    if (p.endereco) pdf.text(p.endereco, pageW / 2, 95, { align: 'center' });
    pdf.text('Data: ' + p.data, pageW / 2, 108, { align: 'center' });
    pdf.text('Ambientes: ' + p.ambientes.length, pageW / 2, 118, { align: 'center' });
    pdf.text('Total de fotos: ' + countTotalFotos(p), pageW / 2, 128, { align: 'center' });
    pdf.setFontSize(10);
    pdf.setTextColor(120);
    pdf.text('Relatorio gerado pelo VistoriaApp', pageW / 2, 280, { align: 'center' });

    var pendingPages = [];
    for (var ai = 0; ai < p.ambientes.length; ai++) {
      var ambiente = p.ambientes[ai];
      if (ambiente.fotos.length === 0) continue;
      for (var fi = 0; fi < ambiente.fotos.length; fi++) {
        pendingPages.push({ ambiente: ambiente, fi: fi, total: ambiente.fotos.length });
      }
    }

    function processPage(idx) {
      if (idx >= pendingPages.length) {
        var blob = pdf.output('blob');
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = p.nome.replace(/\s+/g, '_') + '_vistoria.pdf';
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        hideOverlay('pdf-loading');
        return;
      }
      var item = pendingPages[idx];
      var foto = item.ambiente.fotos[item.fi];

      pdf.addPage();

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(0);
      pdf.text(item.ambiente.nome, margin, margin + 6);

      pdf.setFontSize(10);
      pdf.setTextColor(100);
      pdf.text('Foto ' + (item.fi + 1) + ' / ' + item.total, margin, margin + 13);

      pdf.setDrawColor(0, 151, 167);
      pdf.setLineWidth(0.5);
      pdf.line(margin, margin + 16, pageW - margin, margin + 16);

      renderFotoToDataUrl(foto, function(imgDataUrl) {
        var imgProps = pdf.getImageProperties(imgDataUrl);
        var imgRatio = imgProps.height / imgProps.width;

        var topY = margin + 20;
        var maxImgH = pageH - margin - topY;
        var imgW, imgH;
        if (imgRatio > maxImgH / contentW) {
          imgH = maxImgH;
          imgW = imgH / imgRatio;
        } else {
          imgW = contentW;
          imgH = imgW * imgRatio;
        }

        var imgX = margin + (contentW - imgW) / 2;
        pdf.addImage(imgDataUrl, 'JPEG', imgX, topY, imgW, imgH);

        var lines = [];
        var notes = [];
        for (var j = 0; j < foto.anotacoes.length; j++) {
          if (foto.anotacoes[j].type === 'line') lines.push(foto.anotacoes[j]);
          else notes.push(foto.anotacoes[j]);
        }

        if (lines.length > 0 || notes.length > 0) {
          var annY = topY + imgH + 6;
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.setTextColor(0);
          pdf.text('Anotacoes:', margin, annY);
          annY += 4;

          if (lines.length > 0) {
            pdf.setFillColor(241, 243, 244);
            pdf.rect(margin, annY - 3, contentW, 6, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.text('#', margin + 2, annY);
            pdf.text('Medida', margin + 14, annY);
            annY += 4;
            pdf.setFont('helvetica', 'normal');
            for (var li = 0; li < lines.length; li++) {
              pdf.text(String(li + 1), margin + 2, annY);
              pdf.text(lines[li].medida, margin + 14, annY);
              annY += 4;
            }
          }

          if (notes.length > 0) {
            annY += 1;
            for (var ni = 0; ni < notes.length; ni++) {
              pdf.setFont('helvetica', 'italic');
              pdf.setFontSize(8);
              pdf.setTextColor(80);
              var split = pdf.splitTextToSize(notes[ni].texto, contentW - 4);
              pdf.text(split, margin + 2, annY);
              annY += split.length * 3.5 + 2;
            }
          }
        }

        setTimeout(function() { processPage(idx + 1); }, 10);
      });
    }

    processPage(0);
  } catch (err) {
    console.error(err);
    showAlert('Erro ao gerar PDF: ' + err.message);
    hideOverlay('pdf-loading');
  }
}

function renderFotoToDataUrl(foto, callback) {
  var img = new Image();
  img.onload = function() {
    var canvas = document.createElement('canvas');
    var maxDim = 2000;
    var ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    var w = canvas.width;
    var h = canvas.height;

    for (var j = 0; j < foto.anotacoes.length; j++) {
      var ann = foto.anotacoes[j];
      if (ann.type === 'line') {
        var x1 = ann.x1 * w;
        var y1 = ann.y1 * h;
        var x2 = ann.x2 * w;
        var y2 = ann.y2 * h;

        ctx.save();
        var angle = Math.atan2(y2 - y1, x2 - x1);
        var lineDist = Math.hypot(x2 - x1, y2 - y1);
        var arrowLen = Math.max(40, Math.min(70, lineDist * 0.06));
        var arrowW = arrowLen * 0.4;
        var lineShorten = arrowLen * 0.3;

        var lx1 = x1 + lineShorten * Math.cos(angle);
        var ly1 = y1 + lineShorten * Math.sin(angle);
        var lx2 = x2 - lineShorten * Math.cos(angle);
        var ly2 = y2 - lineShorten * Math.sin(angle);

        var mx = (x1 + x2) / 2;
        var my = (y1 + y2) / 2;
        var fontSize = Math.max(36, Math.min(80, lineDist * 0.1));
        ctx.font = 'bold ' + fontSize + 'px Arial';
        var m = ctx.measureText(ann.medida);
        var textW = m.width + fontSize * 0.4;
        var halfGap = textW / 2;

        var gapStartX = mx - halfGap * Math.cos(angle);
        var gapStartY = my - halfGap * Math.sin(angle);
        var gapEndX = mx + halfGap * Math.cos(angle);
        var gapEndY = my + halfGap * Math.sin(angle);

        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = Math.max(5, Math.min(10, lineDist * 0.01));
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(lx1, ly1);
        ctx.lineTo(gapStartX, gapStartY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(gapEndX, gapEndY);
        ctx.lineTo(lx2, ly2);
        ctx.stroke();

        ctx.fillStyle = '#ff3b30';
        drawArrowShape(ctx, x1, y1, angle + Math.PI, arrowLen, arrowW);
        drawArrowShape(ctx, x2, y2, angle, arrowLen, arrowW);

        ctx.translate(mx, my);
        ctx.rotate(angle);
        ctx.fillStyle = '#ff3b30';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ann.medida, 0, 0);
        ctx.restore();
      } else if (ann.type === 'note') {
        var px = ann.x * w;
        var py = ann.y * h;

        ctx.save();
        var noteFontSize = Math.max(30, Math.min(60, w * 0.04));
        ctx.font = noteFontSize + 'px Arial';
        var nlines = ann.texto.split('\n');
        var noteLineHeight = noteFontSize * 1.3;
        var maxLineW = 0;
        for (var li = 0; li < nlines.length; li++) {
          var lw = ctx.measureText(nlines[li]).width;
          if (lw > maxLineW) maxLineW = lw;
        }
        var notePad = noteFontSize * 0.5;
        var noteBgW = maxLineW + notePad * 2;
        var noteBgH = nlines.length * noteLineHeight + notePad * 2;

        ctx.fillStyle = 'rgba(255,204,0,0.92)';
        ctx.beginPath();
        ctx.roundRect(px - notePad, py - noteBgH, noteBgW, noteBgH, noteFontSize * 0.2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (var nli = 0; nli < nlines.length; nli++) {
          ctx.fillText(nlines[nli], px, py - noteBgH + notePad + nli * noteLineHeight);
        }
        ctx.restore();
      }
    }

    callback(canvas.toDataURL('image/jpeg', 0.85));
  };
  img.src = foto.src;
}

// ===== Keyboard =====
$('input-nome-projeto').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') createProject();
});
$('input-nome-ambiente').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') createAmbiente();
});
$('input-medida').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') confirmMedida();
});
$('input-nota').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmNota(); }
});
$('input-rename').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') confirmRename();
});

// ===== Resize =====
window.addEventListener('resize', function() {
  if ($('screen-anotacao').classList.contains('active')) {
    initCanvas();
  }
});

// ===== Visibilitychange (iOS camera fix) =====
document.addEventListener('visibilitychange', function() {
  if (document.hidden) return;
  if ($('screen-fotos').classList.contains('active')) {
    renderFotos();
  } else if ($('screen-anotacao').classList.contains('active')) {
    initCanvas();
  }
});

// ===== iOS keyboard handling =====
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', function() {
    var overlays = document.querySelectorAll('.overlay:not(.hidden)');
    for (var i = 0; i < overlays.length; i++) {
      overlays[i].style.height = window.visualViewport.height + 'px';
    }
  });
}

// ===== Init =====
renderProjetos();
