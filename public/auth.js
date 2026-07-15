// ---------- Sesión ----------
function guardarSesion(token, usuario) {
  localStorage.setItem('helpdesk_token', token);
  localStorage.setItem('helpdesk_usuario', JSON.stringify(usuario));
}

function obtenerToken() {
  return localStorage.getItem('helpdesk_token');
}

function obtenerUsuario() {
  const raw = localStorage.getItem('helpdesk_usuario');
  return raw ? JSON.parse(raw) : null;
}

function cerrarSesion() {
  localStorage.removeItem('helpdesk_token');
  localStorage.removeItem('helpdesk_usuario');
  window.location.href = 'login.html';
}

// Redirige a login.html si no hay sesión, o si el rol no está permitido en esta página.
// rolesPermitidos: array de roles, ej. ['tecnico'] — si se omite, solo exige estar logueado.
function protegerPagina(rolesPermitidos) {
  const usuario = obtenerUsuario();
  const token = obtenerToken();

  if (!token || !usuario) {
    window.location.href = 'login.html';
    return null;
  }

  if (rolesPermitidos && rolesPermitidos.length > 0 && !rolesPermitidos.includes(usuario.rol)) {
    window.location.href = paginaPorRol(usuario.rol);
    return null;
  }

  return usuario;
}

function paginaPorRol(rol) {
  if (rol === 'tecnico') return 'tecnico.html';
  if (rol === 'gerente') return 'dashboard.html';
  return 'empleado.html';
}

// ---------- Fetch autenticado ----------
async function authFetch(url, options = {}) {
  const token = obtenerToken();
  const headers = Object.assign({}, options.headers, {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : ''
  });

  const res = await fetch(url, Object.assign({}, options, { headers }));

  if (res.status === 401) {
    cerrarSesion();
    throw new Error('Sesión expirada, inicia sesión de nuevo');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error en la solicitud');
  return data;
}

// ---------- Barra de navegación dinámica según el rol ----------
const NAV_POR_ROL = {
  empleado: [{ href: 'empleado.html', label: 'Mis Tickets' }],
  tecnico: [{ href: 'tecnico.html', label: 'Bandeja de Tickets' }],
  gerente: [
    { href: 'admin.html', label: 'Todos los Tickets' },
    { href: 'dashboard.html', label: 'Dashboard' }
  ]
};

const NOMBRE_ROL = { empleado: 'Empleado', tecnico: 'Técnico', gerente: 'Gerente' };

function renderTopbar(paginaActiva) {
  const usuario = obtenerUsuario();
  if (!usuario) return;

  const links = NAV_POR_ROL[usuario.rol] || [];
  const enlacesHtml = links.map(l =>
    `<a href="${l.href}" class="${l.href === paginaActiva ? 'activo' : ''}">${l.label}</a>`
  ).join('');

  document.getElementById('topbar-container').innerHTML = `
    <header class="topbar">
      <div class="marca"><span class="foco"></span> Help Desk Inteligente</div>
      <nav class="tabs">${enlacesHtml}</nav>
      <div class="usuario-info">
        <span class="badge-rol">${NOMBRE_ROL[usuario.rol]}</span>
        <span class="usuario-nombre">${usuario.nombre}</span>
        <button class="btn-salir" onclick="cerrarSesion()">Salir</button>
      </div>
    </header>
  `;
}
