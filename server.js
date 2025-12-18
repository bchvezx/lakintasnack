const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Crear directorio uploads si no existe
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuración de la base de datos
const db = new sqlite3.Database('./database.db');

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});
const upload = multer({ storage: storage });

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'la-quinta-snack-bar-secret-key-2024',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Inicializar base de datos
db.serialize(() => {
  // Tabla de usuarios admin
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'admin'
  )`);

  // Tabla de configuración del negocio
  db.run(`CREATE TABLE IF NOT EXISTS business_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    hours TEXT,
    whatsapp TEXT,
    facebook TEXT,
    instagram TEXT,
    twitter TEXT
  )`);

  // Tabla del menú
  db.run(`CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT,
    name TEXT,
    description TEXT,
    price REAL,
    image TEXT,
    available INTEGER DEFAULT 1
  )`);

  // Tabla del blog
  db.run(`CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published INTEGER DEFAULT 1
  )`);

  // Tabla de galería
  db.run(`CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image TEXT,
    caption TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabla de mensajes de contacto
  db.run(`CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT,
    phone TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read INTEGER DEFAULT 0
  )`);

  // Crear usuario admin por defecto
  const defaultPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password) VALUES ('admin', ?)`, [defaultPassword]);

  // Configuración inicial del negocio
  db.run(`INSERT OR IGNORE INTO business_config (id, name, phone, email, address, hours, whatsapp) 
          VALUES (1, 'La Quinta Snack Bar', '+1 (555) 123-4567', 'info@laquintasnackbar.com', 
          'Calle Principal #123, Centro, Ciudad', 
          'Lun-Vie: 7:00 AM - 9:00 PM<br>Sáb-Dom: 8:00 AM - 10:00 PM',
          '+15551234567')`);

  // Elementos del menú por defecto
  const menuItems = [
    ['Comidas Principales', 'Hamburguesa Clásica', 'Carne, lechuga, tomate, cebolla', 8.50],
    ['Comidas Principales', 'Hamburguesa Especial', 'Carne, queso, bacon, vegetales', 12.00],
    ['Comidas Principales', 'Sandwich de Pollo', 'Pollo a la parrilla, vegetales frescos', 9.00],
    ['Bebidas', 'Café Americano', 'Café recién molido', 2.50],
    ['Bebidas', 'Jugo Natural', 'Jugos de frutas frescas', 4.00],
    ['Snacks', 'Papas Fritas', 'Papas crujientes con sal', 3.50]
  ];

  menuItems.forEach(item => {
    db.run(`INSERT OR IGNORE INTO menu_items (category, name, description, price) 
            VALUES (?, ?, ?, ?)`, item);
  });
});

// Middleware de autenticación
function requireAuth(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/admin/login');
  }
}

// RUTAS PÚBLICAS

// Página principal
app.get('/', (req, res) => {
  db.get('SELECT * FROM business_config WHERE id = 1', (err, config) => {
    db.all('SELECT * FROM menu_items WHERE available = 1 ORDER BY category, name', (err, menuItems) => {
      db.all('SELECT * FROM gallery ORDER BY created_at DESC LIMIT 6', (err, gallery) => {
        db.all('SELECT * FROM blog_posts WHERE published = 1 ORDER BY created_at DESC LIMIT 3', (err, posts) => {
          res.render('index', { 
            config: config || {}, 
            menuItems: menuItems || [], 
            gallery: gallery || [],
            posts: posts || []
          });
        });
      });
    });
  });
});

// Blog
app.get('/blog', (req, res) => {
  db.all('SELECT * FROM blog_posts WHERE published = 1 ORDER BY created_at DESC', (err, posts) => {
    db.get('SELECT * FROM business_config WHERE id = 1', (err, config) => {
      res.render('blog', { posts: posts || [], config: config || {} });
    });
  });
});

// Post individual del blog
app.get('/blog/:id', (req, res) => {
  db.get('SELECT * FROM blog_posts WHERE id = ? AND published = 1', [req.params.id], (err, post) => {
    db.get('SELECT * FROM business_config WHERE id = 1', (err, config) => {
      if (post) {
        res.render('blog-post', { post, config: config || {} });
      } else {
        res.redirect('/blog');
      }
    });
  });
});

// Contacto
app.post('/contact', (req, res) => {
  const { name, email, phone, message } = req.body;
  db.run('INSERT INTO contact_messages (name, email, phone, message) VALUES (?, ?, ?, ?)',
    [name, email, phone, message], (err) => {
      if (err) {
        res.json({ success: false, message: 'Error al enviar mensaje' });
      } else {
        res.json({ success: true, message: 'Mensaje enviado correctamente' });
      }
    });
});

// RUTAS DE ADMINISTRACIÓN

// Login
app.get('/admin/login', (req, res) => {
  res.render('admin/login');
});

app.get('/admin', requireAuth, (req, res) => {
  res.render('admin/dashboard', { user: req.session.user });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (user && bcrypt.compareSync(password, user.password)) {
      req.session.user = user;
      res.redirect('/admin');
    } else {
      res.render('admin/login', { error: 'Usuario o contraseña incorrectos' });
    }
  });
});

// Logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Configuración del negocio
app.get('/admin/config', requireAuth, (req, res) => {
  db.get('SELECT * FROM business_config WHERE id = 1', (err, config) => {
    res.render('admin/config', { config: config || {}, user: req.session.user });
  });
});

app.post('/admin/config', requireAuth, (req, res) => {
  const { name, phone, email, address, hours, whatsapp, facebook, instagram, twitter } = req.body;
  
  db.run(`UPDATE business_config SET name = ?, phone = ?, email = ?, address = ?, hours = ?, 
          whatsapp = ?, facebook = ?, instagram = ?, twitter = ? WHERE id = 1`,
    [name, phone, email, address, hours, whatsapp, facebook, instagram, twitter], (err) => {
      res.redirect('/admin/config');
    });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
});