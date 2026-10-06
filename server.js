const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Crear la carpeta 'uploads' automáticamente si no existe
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// Configuración de Multer para guardar las imágenes subidas
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Hacer que la carpeta 'uploads' sea pública para ver las imágenes en el navegador
app.use('/uploads', express.static(uploadDir));

// Servir los archivos estáticos del frontend (index.html, app.js, style.css)
app.use(express.static(path.join(__dirname)));

// Conexión a PostgreSQL en la nube (Neon)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_g8qW2JpveVjD@ep-snowy-meadow-b5at8ih3-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

// 1. Obtener todas las incidencias
app.get('/api/incidencias', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM incidencias ORDER BY score DESC');
        for (let inc of result.rows) {
            const hist = await pool.query(`
                SELECT estado, usuario, TO_CHAR(tiempo, 'HH24:MI - DD/MM/YYYY') as tiempo 
                FROM historial_estados WHERE incidencia_id = $1 ORDER BY id ASC
            `, [inc.id]);
            inc.historial = hist.rows;
        }
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error en el servidor');
    }
});

// 2. Crear nueva incidencia con imagen optimizada
app.post('/api/incidencias', upload.single('imagen'), async (req, res) => {
    try {
        const { descripcion, sede, bloque, salon, reportadoPor, gravedad, riesgo, frecuencia, score, prioridad, slaHoras } = req.body;
        
        let imagenUrl = null;
        if (req.file) {
            imagenUrl = `/uploads/${req.file.filename}`;
        }

        const nuevaInc = await pool.query(
            `INSERT INTO incidencias (descripcion, sede, bloque, salon, reportado_por, gravedad, riesgo, frecuencia, score, prioridad, sla_horas, imagen) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [descripcion, sede, bloque, salon, reportadoPor, gravedad, riesgo, frecuencia, score, prioridad, slaHoras, imagenUrl]
        );

        const incidenciaId = nuevaInc.rows[0].id;

        await pool.query(
            `INSERT INTO historial_estados (incidencia_id, estado, usuario) VALUES ($1, 'Pendiente', $2)`,
            [incidenciaId, reportadoPor]
        );

        res.json(nuevaInc.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al registrar incidencia');
    }
});

// 3. Actualizar el estado de una incidencia
app.put('/api/incidencias/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, usuario } = req.body;

        await pool.query('UPDATE incidencias SET estado = $1 WHERE id = $2', [estado, id]);
        
        await pool.query(
            `INSERT INTO historial_estados (incidencia_id, estado, usuario) VALUES ($1, $2, $3)`,
            [id, estado, usuario]
        );

        res.json({ message: 'Estado actualizado con éxito' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al actualizar estado');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en puerto ${PORT}`);
});