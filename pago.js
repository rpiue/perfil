const axios = require('axios');

const ACCESS_TOKEN = 'APP_USR-4800771767205670-100318-b5830cdbf2f841d503721e9f92fa2e38-1609795587';


// ✅ CREAR LINK DE PAGO SOLO CON PAGOEFECTIVO, SIN BACK_URLS
async function generarLinkPago({ email, nombre, monto, descripcion, plan, app }) {
    //const { acortarLink } = require('./acortador');

    try {
        const response = await axios.post('https://api.mercadopago.com/checkout/preferences', {
            payer: {
                last_name: nombre,
                email: email
            }, items: [
                {
                    title: descripcion || 'Producto o servicio',
                    quantity: 1,
                    currency_id: 'PEN',
                    unit_price: monto
                }
            ],
            payment_methods: {
                excluded_payment_types: [
                    { id: 'credit_card' },
                    { id: 'debit_card' }
                ]
            },
            metadata: {
                plan: plan || 'Desconocido',
                app: app || 'Desconocido',
                monto: monto || 0,
            },
            notification_url: 'https://perfil-ldpa.onrender.com/webhook',
            external_reference: email,
            statement_descriptor: 'MERCADOPAGO'
        }, {
            headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`
            }
        });

        const link = response.data.init_point;
        //const shortLink = await acortarLink(link, {title: 'Codex Apps (Pagos)',
        //    description: 'Activa tu plan mensual ahora',
        //    image: 'https://img.freepik.com/foto-gratis/factura-telefono-3d-concepto-seguridad-pago-linea_107791-16722.jpg?semt=ais_hybrid&w=740'});

        console.log(`✅ Link generado para ${email}: ${link}`);
        return link;

    } catch (err) {
        console.error('❌ Error al generar el link:', err.response?.data || err.message);
        throw new Error('No se pudo generar el link de pago');
    }
}

// ✅ WEBHOOK: Solo imprime pagos aprobados

module.exports = { generarLinkPago, ACCESS_TOKEN };
