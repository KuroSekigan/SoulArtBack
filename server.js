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
import admin from './firebase.js';
import Stripe from "stripe";

// Inicialización
const app = express();
const JWT_SECRET = 's3cr3t_s0ulart';
app.use(cors());
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Estos deben ir antes que multer
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Conexión a la base de datos
const db = mysql.createConnection({
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
                    { expiresIn: '8h' } // el token durará 2 horas
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

// Ruta para login con Google
app.post('/google-login', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Token de Google requerido' });
        }

        // ✅ Verificar token con Firebase Admin
        const decoded = await admin.auth().verifyIdToken(token);

        const correo = decoded.email;
        const nombre_usuario = decoded.name || correo.split('@')[0]; // fallback si no hay name
        const foto_perfil = decoded.picture || 'https://res.cloudinary.com/dtz7wzh0c/image/upload/v1753396083/default_profile_htx1ge.png';

        // 🔍 Revisar si el usuario ya existe
        const query = 'SELECT * FROM usuarios WHERE correo = ?';
        db.query(query, [correo], async (err, results) => {
            if (err) {
                console.error('❌ Error en consulta Google login:', err);
                return res.status(500).json({ error: 'Error en el servidor' });
            }

            if (results.length > 0) {
                const usuario = results[0];

                if (usuario.estado_id === 2) {
                    return res.json({ success: false, message: 'Este usuario está baneado o inhabilitado.' });
                }

                // ✅ Usuario existente → generar token JWT de tu app
                const appToken = jwt.sign(
                    {
                        id: usuario.id,
                        correo: usuario.correo,
                        nombre_usuario: usuario.nombre_usuario,
                        foto_perfil: usuario.foto_perfil
                    },
                    JWT_SECRET,
                    { expiresIn: '8h' }
                );

                return res.json({
                    success: true,
                    message: '¡Login con Google exitoso!',
                    token: appToken,
                    foto_perfil: usuario.foto_perfil
                });
            } else {
                // ❌ Usuario no existe → debe crear contraseña
                return res.json({
                    success: false,
                    requirePassword: true,
                    correo,
                    nombre_usuario,
                    foto_perfil
                });
            }
        });
    } catch (error) {
        console.error('❌ Error en Google login:', error);
        res.status(401).json({ error: 'Token inválido' });
    }
});

// Ruta para crear contraseña después de Google login
app.post('/crear-password', async (req, res) => {
    try {
        const { correo, nombre_usuario, password, foto_perfil } = req.body;

        if (!correo || !nombre_usuario || !password) {
            return res.status(400).json({ error: 'Faltan datos obligatorios' });
        }

        const existeQuery = 'SELECT * FROM usuarios WHERE correo = ?';
        db.query(existeQuery, [correo], async (err, results) => {
            if (err) {
                console.error('❌ Error al verificar usuario existente:', err);
                return res.status(500).json({ error: 'Error en el servidor' });
            }

            if (results.length > 0) {
                return res.json({ success: false, message: 'Este correo ya está registrado.' });
            }

            const hash = await bcrypt.hash(password, 10);
            const insertQuery = `
                INSERT INTO usuarios (correo, nombre_usuario, contraseña, estado_id, foto_perfil)
                VALUES (?, ?, ?, ?, ?)
            `;

            db.query(insertQuery, [correo, nombre_usuario, hash, 1, foto_perfil], (err, result) => {
                if (err) {
                    console.error('❌ Error al insertar usuario Google:', err);
                    return res.status(500).json({ error: 'Error al registrar' });
                }

                // ✅ Generar token después de crear usuario
                const token = jwt.sign(
                    { id: result.insertId, correo, nombre_usuario, foto_perfil },
                    JWT_SECRET,
                    { expiresIn: '8h' }
                );

                return res.json({
                    success: true,
                    message: 'Usuario registrado con Google',
                    token,
                    foto_perfil
                });
            });
        });
    } catch (error) {
        console.error('❌ Error inesperado en crear-password:', error);
        res.status(500).json({ error: 'Error interno' });
    }
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

// Obtener todos los cómics que estén en estado "publicado"
app.get('/comics/publicados', (req, res) => {
    const { q } = req.query;

    let sql = `
        SELECT comics.*, usuarios.nombre_usuario AS autor
        FROM comics
        JOIN usuarios ON comics.autor_id = usuarios.id
        WHERE comics.publicacion = 'publicado'
    `;
    let params = [];

    if (q) {
        sql += ` AND (comics.titulo LIKE ? OR usuarios.nombre_usuario LIKE ?)`;
        params.push(`%${q}%`, `%${q}%`);
    }

    sql += ` ORDER BY comics.fecha_creacion DESC`;

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('❌ Error al obtener cómics publicados:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
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

    if (!titulo || !descripcion || !autor_id || !idioma_id) {
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

// Subir capítulo + páginas
app.post('/comic/:comicId/capitulos', verificarToken, uploadPaginas.array('imagenes'), (req, res) => {
    const comicId = req.params.comicId;
    const { titulo, numero, globos } = req.body;
    const imagenes = req.files;

    if (!titulo || !numero) {
        return res.status(400).json({ error: 'Faltan campos obligatorios: título o número' });
    }

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
        const paginasGuardadas = [];

        const sqlPagina = `
            INSERT INTO paginas (capitulo_id, numero, imagen_url)
            VALUES (?, ?, ?)
        `;

        const tareas = (imagenes && imagenes.length > 0)
            ? imagenes.map((img, index) => {
                return new Promise((resolve, reject) => {
                    db.query(sqlPagina, [capituloId, index + 1, img.path], (err, result) => {
                        if (err) return reject(err);
                        paginasGuardadas[index] = result.insertId; // Guardamos el id de la página insertada
                        resolve();
                    });
                });
            })
            : [new Promise((resolve, reject) => {
                db.query(sqlPagina, [capituloId, 1, defaultUrl], (err, result) => {
                    if (err) return reject(err);
                    paginasGuardadas[0] = result.insertId;
                    resolve();
                });
            })];

        Promise.all(tareas)
            .then(() => {
                // Si no hay globos, responder ya
                if (!globos) {
                    return res.json({
                        success: true,
                        message: 'Capítulo y páginas subidos correctamente (sin globos)',
                        capitulo_id: capituloId
                    });
                }

                let globosData;
                try {
                    globosData = JSON.parse(globos);
                } catch (e) {
                    console.warn('⚠️ Globos no son un JSON válido');
                    return res.status(400).json({ error: 'Formato de globos inválido' });
                }

                // Insertar globos
                const sqlGlobo = `
                    INSERT INTO globos_texto (pagina_id, tipo, texto, x, y, ancho, alto, fuente, tamano)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                const tareasGlobos = globosData.map(globo => {
                    const {
                        paginaIndice, tipo, texto, x, y, ancho, alto, fuente, tamano
                    } = globo;

                    const paginaId = paginasGuardadas[paginaIndice];
                    if (paginaId === undefined) return Promise.resolve(); // Evitar error si el índice no existe

                    return new Promise((resolve, reject) => {
                        db.query(sqlGlobo, [
                            paginaId,
                            tipo || 'normal',
                            texto,
                            parseFloat(x),
                            parseFloat(y),
                            parseFloat(ancho),
                            parseFloat(alto),
                            fuente || 'Arial',
                            tamano || 14
                        ], (err) => {
                            if (err) return reject(err);
                            resolve();
                        });
                    });
                });

                return Promise.all(tareasGlobos).then(() => {
                    res.json({
                        success: true,
                        message: 'Capítulo, páginas y globos subidos correctamente',
                        capitulo_id: capituloId
                    });
                });
            })
            .catch(error => {
                console.error('❌ Error en subida:', error);
                res.status(500).json({ error: 'Error al subir capítulo, páginas o globos' });
            });
    });
});

app.get('/capitulo/:id', (req, res) => {
    const { id } = req.params;

    db.query('SELECT * FROM capitulos WHERE id = ?', [id], (errCap, capituloResult) => {
        if (errCap) {
            console.error('Error al obtener capítulo:', errCap);
            return res.status(500).json({ mensaje: 'Error interno del servidor' });
        }

        if (capituloResult.length === 0) {
            return res.status(404).json({ mensaje: 'Capítulo no encontrado' });
        }

        const capitulo = capituloResult[0];

        db.query(
            'SELECT * FROM paginas WHERE capitulo_id = ? ORDER BY numero ASC',
            [id],
            (errPag, paginasResult) => {
                if (errPag) {
                    console.error('Error al obtener páginas:', errPag);
                    return res.status(500).json({ mensaje: 'Error interno del servidor' });
                }

                const paginaIds = paginasResult.map(p => p.id);
                if (paginaIds.length === 0) {
                    // Si no hay páginas, no hay globos
                    return res.json({
                        id: capitulo.id,
                        titulo: capitulo.titulo,
                        numero: capitulo.numero,
                        id_comic: capitulo.id_comic,
                        paginas: []
                    });
                }

                // Obtener todos los globos para esas páginas
                db.query(
                    `SELECT * FROM globos_texto WHERE pagina_id IN (?)`,
                    [paginaIds],
                    (errGlobos, globosResult) => {
                        if (errGlobos) {
                            console.error('Error al obtener globos de texto:', errGlobos);
                            return res.status(500).json({ mensaje: 'Error interno del servidor' });
                        }

                        // Agrupar globos por pagina_id
                        const globosPorPagina = {};
                        globosResult.forEach(globo => {
                            if (!globosPorPagina[globo.pagina_id]) {
                                globosPorPagina[globo.pagina_id] = [];
                            }
                            globosPorPagina[globo.pagina_id].push({
                                id: globo.id,
                                tipo: globo.tipo,
                                texto: globo.texto,
                                x: globo.x,
                                y: globo.y,
                                ancho: globo.ancho,
                                alto: globo.alto,
                                fuente: globo.fuente,
                                tamano: globo.tamano
                            });
                        });

                        // Armar páginas con globos incluidos
                        const paginasConTodo = paginasResult.map(pagina => ({
                            id: pagina.id,
                            numero: pagina.numero,
                            url: pagina.imagen_url,
                            globos: globosPorPagina[pagina.id] || []
                        }));

                        res.json({
                            id: capitulo.id,
                            titulo: capitulo.titulo,
                            numero: capitulo.numero,
                            id_comic: capitulo.id_comic,
                            paginas: paginasConTodo
                        });
                    }
                );
            }
        );
    });
});

app.delete('/capitulo/:id', verificarToken, (req, res) => {
    const capituloId = req.params.id;

    // Paso 1: Obtener los IDs de las páginas del capítulo
    const obtenerPaginasSql = 'SELECT id FROM paginas WHERE capitulo_id = ?';

    db.query(obtenerPaginasSql, [capituloId], (err, paginas) => {
        if (err) {
            console.error('❌ Error al obtener páginas del capítulo:', err);
            return res.status(500).json({ error: 'Error al obtener páginas' });
        }

        const paginaIds = paginas.map(p => p.id);

        if (paginaIds.length === 0) {
            // No hay páginas, eliminar solo el capítulo
            eliminarCapitulo();
            return;
        }

        // Paso 2: Eliminar globos_texto asociados a esas páginas
        const eliminarGlobosSql = 'DELETE FROM globos_texto WHERE pagina_id IN (?)';

        db.query(eliminarGlobosSql, [paginaIds], (err) => {
            if (err) {
                console.error('❌ Error al eliminar globos de texto:', err);
                return res.status(500).json({ error: 'Error al eliminar globos de texto' });
            }

            // Paso 3: Eliminar las páginas
            const eliminarPaginasSql = 'DELETE FROM paginas WHERE capitulo_id = ?';

            db.query(eliminarPaginasSql, [capituloId], (err) => {
                if (err) {
                    console.error('❌ Error al eliminar páginas del capítulo:', err);
                    return res.status(500).json({ error: 'Error al eliminar páginas' });
                }

                // Paso 4: Eliminar el capítulo
                eliminarCapitulo();
            });
        });
    });

    function eliminarCapitulo() {
        const eliminarCapituloSql = 'DELETE FROM capitulos WHERE id = ?';

        db.query(eliminarCapituloSql, [capituloId], (err) => {
            if (err) {
                console.error('❌ Error al eliminar capítulo:', err);
                return res.status(500).json({ error: 'Error al eliminar capítulo' });
            }

            res.json({ success: true, message: 'Capítulo, páginas y globos eliminados correctamente' });
        });
    }
});

app.put('/capitulo/:id', verificarToken, uploadPaginas.array('imagenes'), (req, res) => {
    const capituloId = req.params.id;
    const { titulo, numero, globos } = req.body;
    const nuevasImagenes = req.files;
    const globosArray = globos ? JSON.parse(globos) : [];

    if (!titulo || !numero) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const sqlUpdateCapitulo = `
        UPDATE capitulos
        SET titulo = ?, numero = ?
        WHERE id = ?
    `;

    db.query(sqlUpdateCapitulo, [titulo, numero, capituloId], (err) => {
        if (err) return res.status(500).json({ error: 'Error al actualizar capítulo' });

        // 🧩 Si hay nuevas imágenes, reemplazamos páginas y globos
        if (nuevasImagenes && nuevasImagenes.length > 0) {
            const obtenerPaginasSql = 'SELECT id FROM paginas WHERE capitulo_id = ?';
            db.query(obtenerPaginasSql, [capituloId], (err, paginas) => {
                if (err) return res.status(500).json({ error: 'Error al obtener páginas anteriores' });

                const paginaIds = paginas.map(p => p.id);
                if (paginaIds.length > 0) {
                    db.query('DELETE FROM globos_texto WHERE pagina_id IN (?)', [paginaIds], (err) => {
                        if (err) return res.status(500).json({ error: 'Error al eliminar globos anteriores' });

                        eliminarPaginasEInsertarNuevas();
                    });
                } else {
                    eliminarPaginasEInsertarNuevas();
                }
            });

            function eliminarPaginasEInsertarNuevas() {
                db.query('DELETE FROM paginas WHERE capitulo_id = ?', [capituloId], (err) => {
                    if (err) return res.status(500).json({ error: 'Error al eliminar páginas anteriores' });

                    const sqlInsertPagina = 'INSERT INTO paginas (capitulo_id, numero, imagen_url) VALUES (?, ?, ?)';
                    const nuevasPaginas = [];

                    const tareas = nuevasImagenes.map((img, index) => {
                        return new Promise((resolve, reject) => {
                            db.query(sqlInsertPagina, [capituloId, index + 1, img.path], (err, result) => {
                                if (err) return reject(err);
                                nuevasPaginas.push(result.insertId);
                                resolve();
                            });
                        });
                    });

                    Promise.all(tareas)
                        .then(() => {
                            const globosFiltrados = globosArray.filter(g => g.paginaIndice != null);
                            if (globosFiltrados.length > 0) {
                                const sqlGlobos = `
                                    INSERT INTO globos_texto 
                                    (pagina_id, tipo, texto, x, y, ancho, alto, fuente, tamano)
                                    VALUES ?
                                `;
                                const valores = globosFiltrados.map(g => [
                                    nuevasPaginas[g.paginaIndice],
                                    g.tipo || 'normal',
                                    g.texto || '',
                                    g.x || 0,
                                    g.y || 0,
                                    g.ancho || 150,
                                    g.alto || 100,
                                    g.fuente || 'Arial',
                                    g.tamano || 14,
                                ]);

                                db.query(sqlGlobos, [valores], (err) => {
                                    if (err) {
                                        console.error('❌ Error al insertar globos:', err);
                                        return res.status(500).json({ error: 'Error al guardar globos' });
                                    }
                                    res.json({ success: true, message: 'Capítulo actualizado con nuevas páginas y globos' });
                                });
                            } else {
                                res.json({ success: true, message: 'Capítulo actualizado con nuevas páginas (sin globos)' });
                            }
                        })
                        .catch((error) => {
                            console.error('❌ Error al insertar nuevas páginas:', error);
                            res.status(500).json({ error: 'Error al insertar nuevas páginas' });
                        });
                });
            }
        }

        // 🎯 Si solo se quieren modificar globos existentes (sin imágenes nuevas)
        else if (globosArray.length > 0) {
            const globosConID = globosArray.filter(g => g.id && g.pagina_id);

            const tareasUpdate = globosConID.map((g) => {
                return new Promise((resolve, reject) => {
                    const sql = `
                        UPDATE globos_texto
                        SET tipo = ?, texto = ?, x = ?, y = ?, ancho = ?, alto = ?, fuente = ?, tamano = ?
                        WHERE id = ? AND pagina_id = ?
                    `;
                    db.query(sql, [
                        g.tipo || 'normal',
                        g.texto || '',
                        g.x || 0,
                        g.y || 0,
                        g.ancho || 150,
                        g.alto || 100,
                        g.fuente || 'Arial',
                        g.tamano || 14,
                        g.id,
                        g.pagina_id
                    ], (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            });

            Promise.all(tareasUpdate)
                .then(() => {
                    res.json({ success: true, message: 'Capítulo y globos actualizados correctamente (sin nuevas páginas)' });
                })
                .catch((err) => {
                    console.error('❌ Error al actualizar globos existentes:', err);
                    res.status(500).json({ error: 'Error al actualizar globos de texto' });
                });
        }

        // 🆗 Solo título/número
        else {
            res.json({ success: true, message: 'Capítulo actualizado correctamente (sin modificar páginas ni globos)' });
        }
    });
});

app.post('/favoritos', verificarToken, (req, res) => {
    const id_usuario = req.usuario.id; // viene del token
    const { id_comic } = req.body;

    const sql = `INSERT IGNORE INTO favoritos (id_usuario, id_comic) VALUES (?, ?)`;
    db.query(sql, [id_usuario, id_comic], (err, result) => {
        if (err) {
            console.error('Error al seguir cómic:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json({ success: true, message: 'Comic seguido correctamente' });
    });
});

app.delete('/favoritos', verificarToken, (req, res) => {
    const id_usuario = req.usuario.id; // del token
    const { id_comic } = req.body;

    const sql = `DELETE FROM favoritos WHERE id_usuario = ? AND id_comic = ?`;
    db.query(sql, [id_usuario, id_comic], (err, result) => {
        if (err) {
            console.error('Error al dejar de seguir cómic:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json({ success: true, message: 'Comic eliminado de favoritos' });
    });
});

app.get('/usuarios/favoritos/:comicId', verificarToken, (req, res) => {
    const usuarioId = req.usuario.id;
    const comicId = req.params.comicId;

    const sql = `SELECT 1 FROM favoritos WHERE id_usuario = ? AND id_comic = ? LIMIT 1`;
    db.query(sql, [usuarioId, comicId], (err, results) => {
        if (err) {
            console.error('Error al verificar favorito:', err);
            return res.status(500).json({ error: 'Error del servidor' });
        }

        const esFavorito = results.length > 0;
        res.json({ esFavorito });
    });
});

app.post('/comics/:comicId/reaccion', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { tipo } = req.body; // "like" o "dislike"
    const comicId = req.params.comicId;

    if (!token) return res.status(401).json({ error: 'Token requerido' });

    jwt.verify(token, JWT_SECRET, (err, userData) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });

        const usuarioId = userData.id;

        const sql = `
            INSERT INTO reacciones_comics (id_usuario, id_comic, tipo)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE tipo = VALUES(tipo), fecha = CURRENT_TIMESTAMP
        `;

        db.query(sql, [usuarioId, comicId, tipo], (err) => {
            if (err) {
                console.error("Error al registrar reacción:", err);
                return res.status(500).json({ error: "Error al guardar reacción" });
            }

            res.json({ mensaje: "Reacción registrada correctamente" });
        });
    });
});

app.get('/comics/:comicId/reacciones', (req, res) => {
    const comicId = req.params.comicId;

    const sql = `
        SELECT 
            SUM(tipo = 'like') AS likes,
            SUM(tipo = 'dislike') AS dislikes
        FROM reacciones_comics
        WHERE id_comic = ?
    `;

    db.query(sql, [comicId], (err, results) => {
        if (err) {
            console.error("Error al obtener reacciones:", err);
            return res.status(500).json({ error: "Error al obtener reacciones" });
        }

        res.json(results[0]);
    });
});

app.get('/comics/:comicId/mi-reaccion', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const comicId = req.params.comicId;

    if (!token) return res.status(401).json({ error: 'Token requerido' });

    jwt.verify(token, JWT_SECRET, (err, userData) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });

        const usuarioId = userData.id;

        const sql = `
            SELECT tipo FROM reacciones_comics
            WHERE id_usuario = ? AND id_comic = ?
        `;

        db.query(sql, [usuarioId, comicId], (err, results) => {
            if (err) {
                console.error("Error al consultar reacción:", err);
                return res.status(500).json({ error: "Error al obtener reacción" });
            }

            if (results.length === 0) {
                return res.json({ tipo: null }); // No reaccionó
            }

            res.json({ tipo: results[0].tipo });
        });
    });
});

// Sección de comentarios

// Obtener comentarios de un capítulo
app.get('/comentarios/:capituloId', (req, res) => {
    const { capituloId } = req.params;

    const sql = `
        SELECT c.id, c.contenido AS texto, c.fecha, u.nombre_usuario AS autor
        FROM comentarios c
        JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.capitulo_id = ?
        ORDER BY c.fecha DESC
    `;

    db.query(sql, [capituloId], (err, result) => {
        if (err) {
            console.error("Error al obtener comentarios:", err);
            return res.status(500).json({ error: "Error al obtener comentarios" });
        }
        res.json(result);
    });
});

//Subir comentarios
app.post('/comentarios', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { capitulo_id, contenido } = req.body;

    if (!token) return res.status(401).json({ error: "Token requerido" });
    if (!capitulo_id || !contenido) return res.status(400).json({ error: "Faltan datos" });

    jwt.verify(token, JWT_SECRET, (err, userData) => {
        if (err) return res.status(403).json({ error: "Token inválido" });

        const usuario_id = userData.id;

        const sql = `
            INSERT INTO comentarios (usuario_id, capitulo_id, contenido, fecha)
            VALUES (?, ?, ?, NOW())
        `;
        db.query(sql, [usuario_id, capitulo_id, contenido], (err, result) => {
            if (err) {
                console.error("Error al guardar comentario:", err);
                return res.status(500).json({ error: "Error al guardar comentario" });
            }
            res.json({ success: true, message: "Comentario agregado" });
        });
    });
});

// Notificaciones

// Obtener notificaciones del usuario
app.get('/notificaciones', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token requerido' });

    jwt.verify(token, JWT_SECRET, (err, userData) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });

        const usuarioId = userData.id;

        const sql = `
            SELECT c.id AS comentario_id, co.titulo AS comic, c.contenido, c.fecha, u.nombre_usuario AS autor, c.visto
            FROM comentarios c
            JOIN capitulos ca ON c.capitulo_id = ca.id 
            JOIN comics co ON ca.comic_id = co.id
            JOIN usuarios u ON c.usuario_id = u.id
            WHERE co.autor_id = ? AND c.usuario_id != ?
            ORDER BY c.fecha DESC
            LIMIT 10
        `;

        db.query(sql, [usuarioId, usuarioId], (err, results) => {
            if (err) {
                console.error("Error al obtener notificaciones:", err);
                return res.status(500).json({ error: "Error al obtener notificaciones" });
            }
            res.json(results);
        });
    });
});

app.post('/notificaciones/vistas', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, async (err, user) => {
        if (err) {
            console.error('Token inválido:', err);
            return res.sendStatus(403);
        }

        const userId = user.id;

        try {
            await db.promise().query(`
        UPDATE comentarios c
        JOIN capitulos ca ON c.capitulo_id = ca.id
        JOIN comics co ON ca.comic_id = co.id
        SET c.visto = 1
        WHERE co.autor_id = ?`, [userId]);

            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Error al marcar notificaciones como vistas" });
        }
    });
});

//Stripe
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { comicId } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1]; // "Bearer <token>"
    
    // 🔑 Decodificar el token para obtener el userId
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const userId = decoded.id;

    const priceId = "price_1SF70LAMum07zANAbhd9xxLp";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `https://soulart-production.up.railway.app/comicInfo/${comicId}?success=true`,
      cancel_url: `https://soulart-production.up.railway.app/comicInfo/${comicId}?cancel=true`,
      metadata: { comicId, userId },
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error("❌ Error creando sesión:", err);
    res.status(500).json({ error: "No se pudo crear la sesión" });
  }
});

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("❌ Error en webhook:", err.message);
      return res.sendStatus(400);
    }

    // 📌 Manejo de eventos
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        const comicId = session.metadata.comicId;
        const userId = session.metadata.userId;
        const subscriptionId = session.subscription;
        const customerId = session.customer;

        console.log("✅ Nueva suscripción creada:", subscriptionId);

        try {
          await db.query(
            `INSERT INTO suscripciones 
              (usuario_id, obra_id, stripe_subscription_id, stripe_customer_id, plan, estado, fecha_inicio) 
             VALUES (?, ?, ?, ?, ?, 'activa', NOW())`,
            [userId, comicId, subscriptionId, customerId, "mensual"]
          );
        } catch (dbErr) {
          console.error("❌ Error guardando suscripción en BD:", dbErr);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;

        console.log("💰 Pago exitoso de suscripción:", subscriptionId);

        try {
          await db.query(
            `UPDATE suscripciones 
             SET ultimo_pago = NOW(), proximo_pago = FROM_UNIXTIME(?) 
             WHERE stripe_subscription_id = ?`,
            [invoice.lines.data[0].period.end, subscriptionId]
          );
        } catch (dbErr) {
          console.error("❌ Error actualizando pago en BD:", dbErr);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const subscriptionId = subscription.id;

        console.log("⚠️ Suscripción cancelada:", subscriptionId);

        try {
          await db.query(
            `UPDATE suscripciones 
             SET estado = 'cancelada', fecha_fin = NOW() 
             WHERE stripe_subscription_id = ?`,
            [subscriptionId]
          );
        } catch (dbErr) {
          console.error("❌ Error cancelando suscripción en BD:", dbErr);
        }
        break;
      }

      default:
        console.log(`ℹ️ Evento no manejado: ${event.type}`);
    }

    res.sendStatus(200);
  }
);

// Puerto
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
