// server.js
const { initializeApp } = require("firebase/app");
const { getFirestore, getDoc, doc  } = require("firebase/firestore/lite");
const { generarLinkPago, ACCESS_TOKEN } = require('./pago');

const express = require('express');
const path = require('path');
const app = express();

const firebaseConfig = {
    apiKey: "AIzaSyDCpa3Pg4hcwxrnWl3-Fb4IhqqsDPO1wbg",
    authDomain: "controller-b0871.firebaseapp.com",
    projectId: "controller-b0871",
    storageBucket: "controller-b0871.firebasestorage.app",
    messagingSenderId: "664100615717",
    appId: "1:664100615717:web:4837b6cad282940a4031cc",
    measurementId: "G-H5705PFPCW"
};

const appf = initializeApp(firebaseConfig);
const db = getFirestore(appf);


const {
    darPlan,
} = require("./db/dato-firebase");

// Define el puerto en el que se ejecutará el servidor
const PORT = process.env.PORT || 3000;

// Usa la carpeta "public" para servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal que envía el archivo index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/yape', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'yapeRedirect.html'));
});

app.post('/sara', async (req, res) => {
    try {
      const { email, planNombre } = req.body;
      console.log('Iniciando')
  
      if (!email || !planNombre) {
        return res.status(400).json({ error: 'Faltan campos requeridos: email, monto o planNombre' });
      }

      let monto
      if (planNombre.toLowerCase().includes('medium')) {
        monto = 35;
      } else if (planNombre.toLowerCase().includes('basico')) {
        monto = 30;
      }
      if(monto > 0){
      console.log('Creando link')
        const paymentLink = await generarLinkPago({
        email,
        name: email.split('@')[0], // ejemplo simple para generar un nombre
        monto,
        descripcion: `${planNombre}`
      });
  
      res.json({ link: paymentLink });
      }else{
      res.status(500).json({ error: 'Error al generar el link de pago' });

      }
      
    } catch (error) {
      console.error('Error al generar el link de pago:', error);
      res.status(500).json({ error: 'Error al generar el link de pago' });
    }
  });


app.post('/webhook', async (req, res) => {
    const { type, data } = req.body;
    if (type === 'payment') {

        const paymentId = data.id;

        try {
            const payment = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: {
                    Authorization: `Bearer ${ACCESS_TOKEN}`
                }
            });

            const pago = payment.data;

            if (pago.status === 'approved') {
                const emailPagador = pago.payer.email;
                const userData = planUser.get(emailPagador);



                if (userData && userData.numero && userData.plan && userData.nombre) {
                    await darPlan(emailPagador, userData.plan)
                    // 🔁 Enviar POST a /confirmar con los datos
                    //await axios.post('https://f4ee-38-224-225-141.ngrok-free.app/confirmar', {
                    //    nombre: userData.nombre,
                    //    numero: userData.numero,
                    //    plan: userData.plan
                    //});

                    //console.log(`📤 POST a /confirmar enviado para ${emailPagador}`);
                } else {
                    //console.log(`⚠️ No se encontró la información para ${emailPagador}`);
                }
            }

        } catch (err) {
            //console.error('❌ Error consultando pago:', err.response?.data || err.message);
        }
    }

    res.sendStatus(200);
});

app.get('/bcp', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'bcpRedirect.html'));
});


app.get('/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const docRef = doc(db, 'links', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return res.status(404).send('❌ Enlace no encontrado');
    }

    const { originalUrl, title, description, image } = docSnap.data();

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${description}" />
        <meta property="og:image" content="${image}" />
        <meta property="og:url" content="${req.protocol}://${req.get('host')}/${id}" />
        <meta http-equiv="refresh" content="0; url=${originalUrl}" />
        <title>Redirigiendo...</title>
        <script>window.location.href = "${originalUrl}";</script>
      </head>
      <body>
        <h1>Redirigiendo...</h1>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('❌ Error al recuperar el link:', err.message);
    res.status(500).send('Error interno');
  }
});

// Inicia el servidor
app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
