// Importaciones
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2';
import bcrypt from 'bcryptjs';

// Inicialización
const app = express();
app.use(cors());
app.use(express.json());


// Conexión a la base de datos
const db = mysql.createConnection({
    host: '127.crossover.proxy.rlwy.net', // Hostname
    user: 'root',      // Usuario de MySQL
    password: 'lvaikfyVcXOZeSkpgIFqECHQyrQXvgaP',      // Contraseña de MySQL
    database: 'railway' // Nombre de la base de datos
});

// Verificar la conexión
db.connect((err) => {
    if (err) {
        console.error('Error de conexión a la base de datos:', err);
        return;
    }
    console.log('¡Conectado a la base de datos!');
});

// Ruta para registrar usuario
app.post('/registro', async (req, res) => {
    const { correo, nombre_usuario, contraseña } = req.body;

    if (!correo || !nombre_usuario || !contraseña) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    try {
        // Verificar si el correo o nombre de usuario ya existen
        const existeQuery = 'SELECT * FROM usuarios WHERE correo = ? OR nombre_usuario = ?';
        db.query(existeQuery, [correo, nombre_usuario], async (err, results) => {
            if (err) {
                console.error('Error en la consulta:', err);
                return res.status(500).json({ error: 'Error en el servidor' });
            }

            if (results.length > 0) {
                return res.json({ success: false, message: 'El correo o nombre de usuario ya están registrados' });
            }

            // Encriptar la contraseña
            const hash = await bcrypt.hash(contraseña, 10);

            // Insertar usuario con estado_id como NULL
            const insertQuery = `
                INSERT INTO usuarios (correo, nombre_usuario, contraseña, estado_id)
                VALUES (?, ?, ?, NULL)
            `;
            db.query(insertQuery, [correo, nombre_usuario, hash], (err, result) => {
                if (err) {
                    console.error('Error al registrar:', err);
                    return res.status(500).json({ error: 'Error al registrar el usuario' });
                }

                res.json({ success: true, message: 'Usuario registrado correctamente' });
            });
        });
    } catch (error) {
        console.error('Error general:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Ruta para verificar el login
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

        // (Opcional) Verificar si el usuario está baneado usando estado_id
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

/*

// Crear un producto
app.post('/productos', (req, res) => {
    const { name, price, description, stock, imageURL } = req.body;
    const query = 'INSERT INTO productos (name, price, description, stock, imageURL) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [name, price, description, stock, imageURL], (err) => {
        if (err) {
            console.error('Error al crear producto:', err);
            res.status(500).json({ error: 'Error al crear producto' });
        } else {
            res.json({ success: true, message: '¡Producto creado!' });
        }
    });
});

// Editar un producto
app.put('/productos/:id', (req, res) => {
    const { id } = req.params;
    const { name, price, description, stock, imageURL } = req.body;
    const query = 'UPDATE productos SET name = ?, price = ?, description = ?, stock = ?, imageURL = ? WHERE id = ?';
    db.query(query, [name, price, description, stock, imageURL, id], (err) => {
        if (err) {
            console.error('Error al actualizar producto:', err);
            res.status(500).json({ error: 'Error al actualizar producto' });
        } else {
            res.json({ success: true, message: '¡Producto actualizado!' });
        }
    });
});

// Eliminar un producto
app.delete('/productos/:id', (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM productos WHERE id = ?';
    db.query(query, [id], (err) => {
        if (err) {
            console.error('Error al eliminar producto:', err);
            res.status(500).json({ error: 'Error al eliminar producto' });
        } else {
            res.json({ success: true, message: '¡Producto eliminado!' });
        }
    });
});

// Ruta para buscar productos por nombre
app.get('/busqueda', (req, res) => {
    const query = req.query.query;
    const sqlQuery = `SELECT * FROM productos WHERE name LIKE ?`;
    db.query(sqlQuery, [`%${query}%`], (err, results) => {
      if (err) {
        console.error('Error al obtener los productos:', err);
        res.status(500).json({ error: 'Error al obtener los productos' });
      } else {
        res.json(results);
      }
    });
  });

  // Ruta para obtener todos los usuarios (Consulta)
app.get('/usuarios', (req, res) => {
    const query = 'SELECT * FROM usuarios';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener los usuarios:', err);
            res.status(500).json({ error: 'Error al obtener los usuarios' });
        } else {
            res.json(results);
        }
    });
});

// Crear usuario
app.post('/usuarios', async (req, res) => {
    const { username, password, email } = req.body;
    try {
        // Encriptar la contraseña
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Inserta el usuario con la contraseña encriptada
        const query = 'INSERT INTO usuarios (username, password, email) VALUES (?, ?, ?)';
        db.query(query, [username, hashedPassword, email], (err) => {
            if (err) {
                console.error("Error al crear usuario:", err);
                res.status(500).send("Error al crear usuario");
                return;
            }
            res.status(201).send("Usuario creado exitosamente");
        });
    } catch (error) {
        console.error("Error al crear usuario:", error);
        res.status(500).send("Error al crear usuario");
    }
});

// Actualizar usuario
app.put('/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { username, password, email } = req.body;

    console.log(`Actualizando usuario con ID: ${id}`);
    console.log(`Datos recibidos:`, { username, password, email });

    try {
        // Validar que el usuario exista antes de actualizarlo
        const query = 'SELECT * FROM usuarios WHERE id = ?';
        db.query(query, [id], async (err, results) => {
            if (err) {
                console.error("Error al consultar el usuario:", err);
                return res.status(500).send("Error al consultar el usuario");
            }

            if (results.length === 0) {
                return res.status(404).send("Usuario no encontrado");
            }

            // Si hay nueva contraseña, encriptarla
            let updatedPassword = password;
            if (password) {
                updatedPassword = await bcrypt.hash(password, 10);
            }

            // Actualizar usuario
            const updateQuery = 'UPDATE usuarios SET username = ?, password = ?, email = ? WHERE id = ?';
            db.query(updateQuery, [username, updatedPassword, email, id], (err) => {
                if (err) {
                    console.error("Error al actualizar el usuario:", err);
                    return res.status(500).send("Error al actualizar el usuario");
                }
                res.send("Usuario actualizado exitosamente");
            });
        });
    } catch (error) {
        console.error("Error al actualizar usuario:", error);
        res.status(500).send("Error al actualizar usuario");
    }
});


// Ruta para eliminar un usuario (Baja)
app.delete('/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM usuarios WHERE id = ?';
    db.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error al eliminar el usuario:', err);
            res.status(500).json({ error: 'Error al eliminar el usuario' });
        } else {
            res.json({ success: true, message: '¡Usuario eliminado exitosamente!' });
        }
    });
});

*/

// Configuración del puerto
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

app.get('/', (req, res) => {
  res.json({ message: 'API backend funcionando' });
});
