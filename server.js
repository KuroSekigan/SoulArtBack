// Importaciones
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import streamifier from 'streamifier';

// Inicialización
const app = express();
app.use(cors());
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
    const { correo, nombre_usuario, contraseña } = req.body;

    if (!correo || !nombre_usuario || !contraseña) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    try {
        const existeQuery = 'SELECT * FROM usuarios WHERE correo = ? OR nombre_usuario = ?';
        db.query(existeQuery, [correo, nombre_usuario], async (err, results) => {
            if (err) return res.status(500).json({ error: 'Error en el servidor' });
            if (results.length > 0) {
                return res.json({ success: false, message: 'Ya registrado' });
            }

            // Aquí tomamos directamente la URL generada por multer-storage-cloudinary
            const imagen_url = req.file?.path || 'https://res.cloudinary.com/demo/image/upload/v1234567890/default_profile.png';

            const hash = await bcrypt.hash(contraseña, 10);
            const insertQuery = `
                INSERT INTO usuarios (correo, nombre_usuario, contraseña, estado_id, imagen_url)
                VALUES (?, ?, ?, NULL, ?)
            `;
            db.query(insertQuery, [correo, nombre_usuario, hash, imagen_url], (err, result) => {
                if (err) return res.status(500).json({ error: 'Error al registrar' });
                res.json({ success: true, message: 'Usuario registrado', imagen: imagen_url });
            });
        });
    } catch (error) {
        console.error(error);
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

        if (usuario.estado_id !== null) {
            return res.json({ success: false, message: 'Este usuario está baneado o inhabilitado.' });
        }

        try {
            const coincide = await bcrypt.compare(contraseña, usuario.contraseña);
            if (coincide) {
                res.json({ success: true, message: '¡Login exitoso!' });
            } else {
                res.json({ success: false, message: 'Correo o contraseña incorrectos' });
            }
        } catch (error) {
            console.error('Error al verificar contraseña:', error);
            res.status(500).json({ error: 'Error interno' });
        }
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
