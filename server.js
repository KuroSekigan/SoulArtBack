// Importaciones
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import streamifier from 'streamifier';
import jwt from 'jsonwebtoken';

// Inicialización
const app = express();
const JWT_SECRET = 's3cr3t_s0ulart';
app.use(cors());

// Estos deben ir antes que multer
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Conexión a la base de datos
const db = mysql.createConnection({
    host: 'mysql.railway.internal',
    user: 'root',
    password: 'lvaikfyVcXOZeSkpgIFqECHQyrQXvgaP',
    database: 'railway'
});

db.connect((err) => {
    if (err) {
        console.error('Error de conexión a la base de datos:', err);
        return;
    }
    console.log('¡Conectado a la base de datos!');
});

// Configurar Cloudinary
cloudinary.config({
    cloud_name: "dtz7wzh0c",
    api_key: "453682627338357",
    api_secret: "5LQaP8AJeroRFpqk5MjgQ-Kjw1k",
});

// Configurar almacenamiento en Cloudinary con multer
const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "usuarios",
        allowed_formats: ["jpg", "png", "jpeg"]
    }
});
const upload = multer({ storage });

// Ruta para registrar usuario
app.post('/registro', upload.single('imagen'), async (req, res) => {
    try {
        console.log('📥 req.body:', req.body);
        console.log('📸 req.file:', req.file);

        const correo = req.body.correo;
        const nombre_usuario = req.body.nombre_usuario;
        const contraseña = req.body.contraseña || req.body["contraseÃ±a"]; // Parche temporal

        if (!correo || !nombre_usuario || !contraseña) {
            return res.status(400).json({ error: 'Faltan datos obligatorios' });
        }

        const existeQuery = 'SELECT * FROM usuarios WHERE correo = ? OR nombre_usuario = ?';

        db.query(existeQuery, [correo, nombre_usuario], async (err, results) => {
            if (err) {
                console.error('❌ Error al verificar usuario existente:', err);
                return res.status(500).json({ error: 'Error en el servidor' });
            }

            if (results.length > 0) {
                return res.json({ success: false, message: 'Ya registrado' });
            }

            const foto_perfil = req.file?.path || 'https://res.cloudinary.com/dtz7wzh0c/image/upload/v1753396083/default_profile_htx1ge.png';
            const hash = await bcrypt.hash(contraseña, 10);

            const insertQuery = `
                INSERT INTO usuarios (correo, nombre_usuario, contraseña, estado_id, foto_perfil)
                VALUES (?, ?, ?, ?, ?)
            `;

            db.query(insertQuery, [correo, nombre_usuario, hash, 1, foto_perfil], (err, result) => {
                if (err) {
                    console.error('❌ Error al insertar en la base de datos:', err);
                    return res.status(500).json({ error: 'Error al registrar' });
                }

                console.log('✅ Usuario registrado en la base de datos');
                return res.json({ success: true, message: 'Usuario registrado', imagen: foto_perfil });
            });
        });
    } catch (error) {
        console.error('❌ Error inesperado:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Ruta para login
app.post('/login', (req, res) => {
    const { correo, contraseña } = req.body;

    if (!correo || !contraseña) {
        return res.status(400).json({ error: 'Correo y contraseña requeridos' });
    }

    const query = 'SELECT * FROM usuarios WHERE correo = ?';
    db.query(query, [correo], async (err, results) => {
        if (err) {
            console.error('Error en la consulta:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }

        if (results.length === 0) {
            return res.json({ success: false, message: 'Correo o contraseña incorrectos' });
        }

        const usuario = results[0];

        if (usuario.estado_id === 2) {
            return res.json({ success: false, message: 'Este usuario está baneado o inhabilitado.' });
        }

        try {
            const coincide = await bcrypt.compare(contraseña, usuario.contraseña);
            if (coincide) {
                const token = jwt.sign(
                    {
                        id: usuario.id,
                        correo: usuario.correo,
                        nombre_usuario: usuario.nombre_usuario,
                        foto_perfil: usuario.foto_perfil
                    },
                    JWT_SECRET,
                    { expiresIn: '2h' } // el token durará 2 horas
                );
            
                res.json({ success: true, message: '¡Login exitoso!', token, foto_perfil: usuario.foto_perfil });
            } else {
                res.json({ success: false, message: 'Correo o contraseña incorrectos' });
            }

        } catch (error) {
            console.error('Error al verificar contraseña:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });
});

app.get('/usuario/:id/perfil', (req, res) => {
    const userId = req.params.id;

    const sql = `
        SELECT nombre_usuario, correo, foto_perfil, biografia, twitter_url, facebook_url, instagram_url 
        FROM usuarios 
        WHERE id = ?
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Error al obtener perfil:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json(results[0]);
    });
});

app.get('/favoritos/:usuario_id', (req, res) => {
    const usuario_id = req.params.usuario_id;

    const sql = `
        SELECT c.id, c.titulo, c.portada_url
        FROM favoritos_comics f 
        JOIN comics c ON f.comic_id = c.id 
        WHERE f.usuario_id = ?
    `;

    db.query(sql, [usuario_id], (err, results) => {
        if (err) {
            console.error('Error al obtener favoritos:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json(results);
    });
});

app.post('/favoritos', (req, res) => {
    const { usuario_id, comic_id } = req.body;

    const sql = `INSERT IGNORE INTO favoritos_comics (usuario_id, comic_id) VALUES (?, ?)`;
    db.query(sql, [usuario_id, comic_id], (err, result) => {
        if (err) {
            console.error('Error al seguir cómic:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json({ success: true, message: 'Comic seguido correctamente' });
    });
});

app.delete('/favoritos', (req, res) => {
    const { usuario_id, comic_id } = req.body;

    const sql = `DELETE FROM favoritos_comics WHERE usuario_id = ? AND comic_id = ?`;
    db.query(sql, [usuario_id, comic_id], (err, result) => {
        if (err) {
            console.error('Error al dejar de seguir cómic:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json({ success: true, message: 'Comic eliminado de favoritos' });
    });
});

// Ruta base
app.get('/', (req, res) => {
    res.json({ message: 'API backend funcionando' });
});

// Puerto
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
