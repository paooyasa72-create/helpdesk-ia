const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'clave-de-desarrollo-cambiar-en-produccion';

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(usuario) {
  return jwt.sign(
    {
      id: usuario._id.toString(),
      email: usuario.email,
      nombre: usuario.nombre,
      rol: usuario.rol
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Middleware: exige un token válido. Si se pasan roles, exige además que el
// usuario tenga uno de esos roles ("empleado", "tecnico", "gerente").
function requireAuth(rolesPermitidos = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'No autenticado. Inicia sesión.' });
    }

    try {
      const payload = verifyToken(token);
      if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(payload.rol)) {
        return res.status(403).json({ error: 'No tienes permiso para realizar esta acción' });
      }
      req.user = payload;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Sesión inválida o expirada. Inicia sesión de nuevo.' });
    }
  };
}

module.exports = { hashPassword, comparePassword, signToken, verifyToken, requireAuth };
