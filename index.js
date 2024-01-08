import express from "express";
import logger from "morgan";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

import { Server } from 'socket.io';
import { createServer } from 'node:http';

dotenv.config()
const port = process.env.PORT ?? 3000;

const app = express();
const server = createServer(app)
const io = new Server(server, {
    connectionStateRecovery: {}
})

const db = createClient({
    url: 'libsql://flexible-cobra-raulchan.turso.io',
    authToken: process.env.DB_TOKEN
})

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT
  )
`)

io.on('connection', async (socket) => {
    console.log('a user has connected!')

    //Cuando se desconecte un cliente
    socket.on('disconnect', () => {
        console.log('a user has disconnected!')
    })

    //Cuando se reciba un mensaje
    socket.on('chat message', async (msg) => {
        let result
        const username = socket.handshake.auth.username ?? 'anonymus'
        try {
            result = await db.execute({
                sql: `INSERT INTO messages(content, user) VALUES (:msg, :username)`,
                args: { msg, username }

            })
        } catch (error) {
            console.error(error)
            return
        }
        io.emit('chat message', msg, result.lastInsertRowid.toString(), username)
    })
    console.log('auth: ')
    console.log(socket.handshake.auth)

    //Se ha conectado un nuevo cliente y no se ha recuperado de una desconexión
    if(!socket.recovered) {
        try {
            const results = await db.execute({
                sql: 'SELECT id, content, user FROM messages WHERE id > ?',
                args: [ socket.handshake.auth.serverOffset ?? 0]

            })

            results.rows.forEach(row => {
                socket.emit('chat message', row.content, row.id.toString(), row.user)
            })
        } catch (error) {
            console.error(error)
        }
    }

})

app.use(logger('dev'));

app.use(express.static("client"));

app.get('/', (req, res) => {
    //res.send('<h1>Esto es el chat</h1>')
    //Tomamos el current working directory y definimos el archivo que tiene que usar
    res.sendFile(process.cwd() + '/client/index.html')
})


server.listen(port , () => {
    console.log(`Server running on port ${port}`)
});

