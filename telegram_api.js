// Importamos la librería node-telegram-bot-api
import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Creamos una constante que guarda el Token de nuestro Bot de Telegram que previamente hemos creado desde el bot @BotFather
const token = process.env.API_KEY_Telegram;
const chatId = '-1003448654958'; // Asegúrate de que este ID sea donde quieres recibir la alerta

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

/**
 * Función para enviar la alerta de trading
 * @param {string} par El par de trading (ej. 'BTCUSDT')
 * @param {string} direccion LONG o SHORT
 * @param {number} rsi El valor actual del RSI
 */


//Obtener el Chat ID
const getChatId = async () => {
    const url = `https://api.telegram.org/bot${process.env.API_KEY_Telegram}/getUpdates`;
    try {
        const response = await axios.get(url);
        console.log("Respuesta completa:", response.data);

        if (response.data.ok && response.data.result.length > 0) {
            const chatId = response.data.result[0].message.chat.id;
            console.log("Chat ID encontrado:", chatId);
            return chatId;
        } else {
            console.log("No hay mensajes recientes. Envía un mensaje al bot primero.");
        }
    } catch (error) {
        console.error("Error al obtener el chat_id:", error.response?.data || error.message);
    }
};



const enviarAlerta = (par, direccion, rsi) => {
    
    /*
    setTimeout(() => {
        const chatIdV2 = getChatId();
        console.log("ID del chat obtenido:", chatIdV2);
    }, 1000); // Retraso de 1 segundo (ajusta según necesidad)
*/

    const mensaje = `
🚨 **ALERTA SCALPING - ${par}** 🚨
**Dirección:** ${direccion}
**RSI:** ${rsi.toFixed(2)}
**Motivo:** Volumen alto y RSI en extremo.
➡️ ¡Revisar manual para ejecución!
`;
    
    // El 'parse_mode: 'Markdown'' permite usar negritas (**) y emojis
    bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' })
        .then(() => {
            console.log(`Alerta enviada a Telegram para ${par}`);
        })
        .catch((error) => {
            console.error('Error al enviar alerta a Telegram:', error.response.body);
        });
}

export { enviarAlerta }

// Ejemplo de uso (simulando una detección)
// enviarAlerta('ETHUSDT', 'LONG', 28.55);