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
const mysql = require('mysql2/promise');

const db = await mysql.createConnection({
    host: 'mysql.railway.internal',
    user: 'root',
    password: 'lvaikfyVcXOZeSkpgIFqECHQyrQXvgaP',
    database: 'railway'
})

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

const storageComics = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "comics",
        allowed_formats: ["jpg", "png", "jpeg"]
    }
});

const uploadComic = multer({ storage: storageComics });

const storagePaginas = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "paginas",
        allowed_formats: ["jpg", "png", "jpeg"]
    }
});

const uploadPaginas = multer({ storage: storagePaginas });

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

app.put('/usuario/:id', upload.single('foto_perfil'), (req, res) => {
    const userId = req.params.id;
    const { biografia, twitter_url, facebook_url, instagram_url } = req.body;

    // Si se subió nueva imagen, usamos esa, si no, dejamos como está
    const nuevaFotoPerfil = req.file?.path;

    let sql = `UPDATE usuarios SET `;
    const campos = [];
    const valores = [];

    if (nuevaFotoPerfil) {
        campos.push('foto_perfil = ?');
        valores.push(nuevaFotoPerfil);
    }
    if (biografia !== undefined) {
        campos.push('biografia = ?');
        valores.push(biografia);
    }
    if (twitter_url !== undefined) {
        campos.push('twitter_url = ?');
        valores.push(twitter_url);
    }
    if (facebook_url !== undefined) {
        campos.push('facebook_url = ?');
        valores.push(facebook_url);
    }
    if (instagram_url !== undefined) {
        campos.push('instagram_url = ?');
        valores.push(instagram_url);
    }

    if (campos.length === 0) {
        return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    sql += campos.join(', ') + ' WHERE id = ?';
    valores.push(userId);

    db.query(sql, valores, (err, result) => {
        if (err) {
            console.error('❌ Error al actualizar usuario:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }

        // Respondemos con los campos actualizados
        const responseData = { success: true, message: 'Perfil actualizado correctamente' };
        if (nuevaFotoPerfil) {
            responseData.foto_perfil = nuevaFotoPerfil;
        }

        res.json(responseData);
    });
});

function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token no proporcionado' });

    jwt.verify(token, JWT_SECRET, (err, usuario) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });
        req.usuario = usuario;
        next();
    });
}

// Obtener todos los cómics subidos por un usuario
app.get('/usuario/:id/comics', (req, res) => {
    const usuarioId = req.params.id;

    const sql = 'SELECT * FROM comics WHERE autor_id = ? ORDER BY fecha_creacion DESC'; // Ajusta columnas si necesitas

    db.query(sql, [usuarioId], (err, results) => {
        if (err) {
            console.error('❌ Error al obtener cómics del usuario:', err);
            return res.status(500).json({ error: 'Error al obtener cómics del usuario' });
        }

        res.json(results);
    });
});

const URL_COMIC_DEFAULT = 'https://res.cloudinary.com/dtz7wzh0c/image/upload/v1753606561/preview_ow9ltw.png';

app.post('/comic', verificarToken, uploadComic.single('portada'), (req, res) => {
    const {
        titulo,
        descripcion,
        idioma_id,
        estado,
        tipo,
        generos
    } = req.body;

    const autor_id = req.usuario.id;

    if (!titulo || !descripcion || !autor_id  || !idioma_id) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const portada_url = req.file?.path || URL_COMIC_DEFAULT;

    const sql = `
        INSERT INTO comics (
            titulo, descripcion, autor_id, idioma_id,
            estado, tipo, generos,
            publicacion, portada_url, fecha_creacion
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'solicitud', ?, NOW())
    `;

    const valores = [
        titulo,
        descripcion,
        autor_id,
        idioma_id,
        estado || 'en progreso',
        tipo || 'comic',
        generos || '',
        portada_url
    ];

    db.query(sql, valores, (err, result) => {
        if (err) {
            console.error('❌ Error al insertar cómic:', err);
            return res.status(500).json({ error: 'Error en el servidor al guardar el cómic' });
        }

        res.json({
            success: true,
            message: 'Cómic creado correctamente',
            comic_id: result.insertId
        });
    });
});

app.get('/comic/:id', (req, res) => {
    const comicId = req.params.id;

    const sql = `
        SELECT comics.*, usuarios.nombre_usuario AS autor
        FROM comics
        JOIN usuarios ON comics.autor_id = usuarios.id
        WHERE comics.id = ?
    `;

    db.query(sql, [comicId], (err, results) => {
        if (err) {
            console.error('❌ Error al obtener cómic:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Cómic no encontrado' });
        }

        res.json(results[0]);
    });
});

app.get('/favoritos/:id_usuario', (req, res) => {
    const id_usuario = req.params.id_usuario;

    const sql = `
        SELECT c.id, c.titulo, c.portada_url
        FROM favoritos f 
        JOIN comics c ON f.id_comic = c.id 
        WHERE f.id_usuario = ?
    `;

    db.query(sql, [id_usuario], (err, results) => {
        if (err) {
            console.error('Error al obtener favoritos:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json(results);
    });
});

app.get('/comic/:id/capitulos', (req, res) => {
    const comicId = req.params.id;

    const sql = `
        SELECT id, titulo, numero, fecha_publicacion 
        FROM capitulos 
        WHERE comic_id = ? 
        ORDER BY numero ASC
    `;

    db.query(sql, [comicId], (err, results) => {
        if (err) {
            console.error('❌ Error al obtener capítulos:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }

        res.json(results);
    });
});

app.get('/capitulo/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [capituloResult] = await db.query('SELECT * FROM capitulos WHERE id = ?', [id]);

    if (capituloResult.length === 0) {
      return res.status(404).json({ mensaje: 'Capítulo no encontrado' });
    }

    const capitulo = capituloResult[0];

    const [paginasResult] = await db.query(
      'SELECT * FROM paginas WHERE id_capitulo = ? ORDER BY numero ASC',
      [id]
    );

    const paginasConUrl = paginasResult.map(pagina => ({
      id: pagina.id,
      numero: pagina.numero,
      url: pagina.url && pagina.url.trim() !== ''
        ? pagina.url
        : 'https://res.cloudinary.com/dtz7wzh0c/image/upload/v1753675703/default_pagina_sqeaj8.png'
    }));

    res.json({
      id: capitulo.id,
      titulo: capitulo.titulo,
      numero: capitulo.numero,
      id_comic: capitulo.id_comic,
      paginas: paginasConUrl
    });

  } catch (error) {
    console.error('Error al obtener capítulo:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
});

// Subir capítulo + páginas
app.post('/comic/:comicId/capitulos', verificarToken, uploadPaginas.array('imagenes'), (req, res) => {
    const comicId = req.params.comicId;
    const { titulo, numero } = req.body;
    const imagenes = req.files;

    if (!titulo || !numero) {
        return res.status(400).json({ error: 'Faltan campos obligatorios: título o número' });
    }

    // Paso 1: insertar el capítulo
    const sqlCapitulo = `
        INSERT INTO capitulos (comic_id, titulo, numero, fecha_publicacion)
        VALUES (?, ?, ?, NOW())
    `;

    db.query(sqlCapitulo, [comicId, titulo, numero], (err, result) => {
        if (err) {
            console.error('❌ Error al insertar capítulo:', err);
            return res.status(500).json({ error: 'Error al crear capítulo' });
        }

        const capituloId = result.insertId;
        const defaultUrl = 'https://res.cloudinary.com/dtz7wzh0c/image/upload/v1753675703/default_pagina_sqeaj8.png';

        // Paso 2: insertar páginas (si no hay imágenes, usar solo una página con imagen por defecto)
        const sqlPagina = `
            INSERT INTO paginas (capitulo_id, numero, imagen_url)
            VALUES (?, ?, ?)
        `;

        const tareas = (imagenes && imagenes.length > 0)
            ? imagenes.map((img, index) => {
                return new Promise((resolve, reject) => {
                    db.query(sqlPagina, [capituloId, index + 1, img.path], (err, result) => {
                        if (err) return reject(err);
                        resolve(result);
                    });
                });
            })
            : [new Promise((resolve, reject) => {
                db.query(sqlPagina, [capituloId, 1, defaultUrl], (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            })];

        Promise.all(tareas)
            .then(() => {
                res.json({
                    success: true,
                    message: 'Capítulo y páginas subidos correctamente',
                    capitulo_id: capituloId
                });
            })
            .catch(error => {
                console.error('❌ Error al insertar páginas:', error);
                res.status(500).json({ error: 'Error al subir páginas del capítulo' });
            });
    });
});

app.delete('/capitulo/:id', verificarToken, (req, res) => {
    const capituloId = req.params.id;

    // Primero eliminamos las páginas asociadas
    const eliminarPaginasSql = 'DELETE FROM paginas WHERE capitulo_id = ?';

    db.query(eliminarPaginasSql, [capituloId], (err) => {
        if (err) {
            console.error('❌ Error al eliminar páginas del capítulo:', err);
            return res.status(500).json({ error: 'Error al eliminar páginas' });
        }

        // Luego eliminamos el capítulo
        const eliminarCapituloSql = 'DELETE FROM capitulos WHERE id = ?';

        db.query(eliminarCapituloSql, [capituloId], (err) => {
            if (err) {
                console.error('❌ Error al eliminar capítulo:', err);
                return res.status(500).json({ error: 'Error al eliminar capítulo' });
            }

            res.json({ success: true, message: 'Capítulo y sus páginas eliminados correctamente' });
        });
    });
});

app.put('/capitulo/:id', verificarToken, uploadPaginas.array('imagenes'), (req, res) => {
    const capituloId = req.params.id;
    const { titulo, numero } = req.body;
    const nuevasImagenes = req.files;

    if (!titulo || !numero) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    // Paso 1: Actualizar los datos del capítulo
    const sqlUpdateCapitulo = `
        UPDATE capitulos
        SET titulo = ?, numero = ?
        WHERE id = ?
    `;

    db.query(sqlUpdateCapitulo, [titulo, numero, capituloId], (err) => {
        if (err) {
            console.error('❌ Error al actualizar capítulo:', err);
            return res.status(500).json({ error: 'Error al actualizar capítulo' });
        }

        // Paso 2: Si hay imágenes nuevas, eliminamos las antiguas y agregamos las nuevas
        if (nuevasImagenes && nuevasImagenes.length > 0) {
            const eliminarPaginasSql = 'DELETE FROM paginas WHERE capitulo_id = ?';

            db.query(eliminarPaginasSql, [capituloId], (err) => {
                if (err) {
                    console.error('❌ Error al eliminar páginas existentes:', err);
                    return res.status(500).json({ error: 'Error al eliminar páginas anteriores' });
                }

                const sqlInsertPagina = `
                    INSERT INTO paginas (capitulo_id, numero, imagen_url)
                    VALUES (?, ?, ?)
                `;

                const tareas = nuevasImagenes.map((img, index) => {
                    return new Promise((resolve, reject) => {
                        db.query(sqlInsertPagina, [capituloId, index + 1, img.path], (err) => {
                            if (err) return reject(err);
                            resolve();
                        });
                    });
                });

                Promise.all(tareas)
                    .then(() => {
                        res.json({
                            success: true,
                            message: 'Capítulo actualizado con nuevas páginas'
                        });
                    })
                    .catch((error) => {
                        console.error('❌ Error al insertar nuevas páginas:', error);
                        res.status(500).json({ error: 'Error al insertar nuevas páginas' });
                    });
            });
        } else {
            // Si no hay nuevas imágenes, solo se actualizó el título/número
            res.json({
                success: true,
                message: 'Capítulo actualizado correctamente (sin modificar páginas)'
            });
        }
    });
});

app.post('/favoritos', (req, res) => {
    const { id_usuario, id_comic } = req.body;

    const sql = `INSERT IGNORE INTO favoritos (id_usuario, id_comic) VALUES (?, ?)`;
    db.query(sql, [id_usuario, id_comic], (err, result) => {
        if (err) {
            console.error('Error al seguir cómic:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json({ success: true, message: 'Comic seguido correctamente' });
    });
});

app.delete('/favoritos', (req, res) => {
    const { id_usuario, id_comic } = req.body;

    const sql = `DELETE FROM favoritos WHERE id_usuario = ? AND id_comic = ?`;
    db.query(sql, [id_usuario, id_comic], (err, result) => {
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
