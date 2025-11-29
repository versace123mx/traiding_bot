import dotenv from 'dotenv';

dotenv.config();

// db_mysql.js

import mysql from 'mysql2/promise';

// ⚠️ MODIFICA ESTOS DATOS con los de tu servidor MySQL
const dbConfig = {
    host: process.env.HOST_DATA_BASE,
    user: process.env.USER_DATA_BASE, 
    password: process.env.PASS_DATA_BASE,
    database: process.env.DB_DATA_BASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Crea un Pool de Conexiones para manejar múltiples peticiones concurrentes de forma eficiente
const pool = mysql.createPool(dbConfig);

// --- Funciones de Lectura y Escritura del Motor ---

/**
 * 1. Obtiene toda la configuración de la tabla 'Configuracion'.
 * @returns {Promise<Object>} Un objeto con la configuración clave/valor.
 */
async function obtenerConfiguracion() {
    try {
        const [rows] = await pool.query('SELECT nombre_parametro, valor FROM configuracion');
        
        // Mapea el array de filas a un objeto de fácil acceso (ej. { apalancamiento: 20, margen_usdt: 50, ... })
        const config = {};
        for (const row of rows) {
            // Convierte el valor a número (float)
            config[row.nombre_parametro] = parseFloat(row.valor);
        }
        return config;
    } catch (error) {
        console.error('❌ Error al obtener configuración de la DB:', error);
        return null;
    }
}

/**
 * 2. Guarda una nueva operación simulada (se activa al encontrar una señal).
 * @param {Object} opData Los datos de la nueva operación.
 * @returns {Promise<number>} El ID de la operación insertada.
 */
async function guardarNuevaOperacion(opData) {
    const query = `
        INSERT INTO OperacionesSimuladas 
        (timestamp_entrada, par_trading, direccion, tamano_posicion, precio_entrada, rsi_entrada, volumen_entrada, id_estado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
        opData.timestamp_entrada,
        opData.par_trading,
        opData.direccion,
        opData.tamano_posicion,
        opData.precio_entrada,
        opData.rsi_entrada,
        opData.volumen_entrada,
        opData.id_estado // Debe ser 1 (Abierta)
    ];

    try {
        const [result] = await pool.query(query, values);
        return result.insertId;
    } catch (error) {
        console.error('❌ Error al guardar nueva operación en la DB:', error);
        throw error; // Propagar el error para detener el ciclo si es crítico
    }
}

/**
 * 3. Obtiene todas las operaciones que están abiertas (id_estado = 1).
 * @returns {Promise<Array<Object>>} Lista de operaciones abiertas.
 */
async function obtenerOperacionesAbiertas() {
    const query = `
        SELECT id_op, par_trading, direccion, precio_entrada, tamano_posicion
        FROM OperacionesSimuladas 
        WHERE id_estado = 1
    `;
    try {
        const [rows] = await pool.query(query);
        return rows;
    } catch (error) {
        console.error('❌ Error al obtener operaciones abiertas de la DB:', error);
        return [];
    }
}

/**
 * 4. Actualiza una operación simulada para registrar el cierre y el resultado.
 * @param {number} opId El ID de la operación a cerrar.
 * @param {Object} cierreData Datos del cierre (id_estado, timestamp_salida, precio_salida, profit_usdt).
 * @returns {Promise<void>}
 */
async function actualizarOperacion(opId, cierreData) {
    const query = `
        UPDATE OperacionesSimuladas 
        SET id_estado = ?, timestamp_salida = ?, precio_salida = ?, profit_usdt = ?
        WHERE id_op = ?
    `;
    const values = [
        cierreData.id_estado,
        cierreData.timestamp_salida,
        cierreData.precio_salida,
        cierreData.profit_usdt,
        opId
    ];

    try {
        await pool.query(query, values);
    } catch (error) {
        console.error(`❌ Error al actualizar operación ${opId} en la DB:`, error);
    }
}


export default {
    obtenerConfiguracion,
    guardarNuevaOperacion,
    obtenerOperacionesAbiertas,
    actualizarOperacion
};