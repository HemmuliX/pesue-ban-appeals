import fetch from 'node-fetch';

import { API_ENDPOINT, MAX_EMBED_FIELD_CHARS, MAX_EMBED_FOOTER_CHARS } from "./helpers/discord-helpers.js";
import { createJwt, decodeJwt } from "./helpers/jwt-helpers.js";
import { getBan, isBlocked } from "./helpers/user-helpers.js";

export async function handler(event, context) {
    let payload;

    if (process.env.USE_NETLIFY_FORMS) {
        payload = JSON.parse(event.body).payload.data;
    } else {
        if (event.httpMethod !== "POST") {
            return {
                statusCode: 405
            };
        }

        const params = new URLSearchParams(event.body);
        payload = {
            banReason: params.get("banReason") || undefined,
            appealText: params.get("appealText") || undefined,
            futureActions: params.get("futureActions") || undefined,
            token: params.get("token") || undefined
        };
    }

    if (payload.banReason !== undefined &&
        payload.appealText !== undefined &&
        payload.futureActions !== undefined && 
        payload.token !== undefined) {
        
        const userInfo = decodeJwt(payload.token);
        if (isBlocked(userInfo.id)) {
            return {
                statusCode: 303,
                headers: {
                    "Location": `/error?msg=${encodeURIComponent("Valitettavasti et voi tehdä hakemusta tällä Discord käyttäjällä.")}`,
                },
            };
        }
        
        const message = {
            embed: {
                title: "Uusi Unban Hakemus!",
                timestamp: new Date().toISOString(),
                fields: [
                    {
                        name: "Lähettäjä",
                        value: `<@${userInfo.id}> (${userInfo.username}#${userInfo.discriminator})`
                    },
                    {
                        name: "Miksi uskot saaneesi porttikiellon?",
                        value: payload.banReason.slice(0, MAX_EMBED_FIELD_CHARS)
                    },
                    {
                        name: "Miksi uskot ansaitsevasi pääsyn takaisin Pesueen Discordiin?",
                        value: payload.appealText.slice(0, MAX_EMBED_FIELD_CHARS)
                    },
                    {
                        name: "Miten aiot toimia jatkossa, jotta välttäisit porttikiellon uusiutumisen?",
                        value: payload.futureActions.slice(0, MAX_EMBED_FIELD_CHARS)
                    }
                ]
            }
        }

        if (process.env.GUILD_ID) {
            try {
                const ban = await getBan(userInfo.id, process.env.GUILD_ID, process.env.DISCORD_BOT_TOKEN);
                if (ban !== null && ban.reason) {
                    message.embed.footer = {
                        text: `Alkuperäinen porttikiellon syy: ${ban.reason}`.slice(0, MAX_EMBED_FOOTER_CHARS)
                    };
                }
            } catch (e) {
                console.log(e);
            }

            if (!process.env.DISABLE_UNBAN_LINK) {
                const unbanUrl = new URL("/.netlify/functions/unban", DEPLOY_PRIME_URL);
                const unbanInfo = {
                    userId: userInfo.id
                };
    
                message.components = [{
                    type: 1,
                    components: [{
                        type: 2,
                        style: 5,
                        label: "Hyväksy hakemus ja kumoa porttikielto",
                        url: `${unbanUrl.toString()}?token=${encodeURIComponent(createJwt(unbanInfo))}`
                    }]
                }];
            }
        }

        const result = await fetch(`${API_ENDPOINT}/channels/${encodeURIComponent(process.env.APPEALS_CHANNEL)}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bot ${process.env.DISCORD_BOT_TOKEN}`
            },
            body: JSON.stringify(message)
        });

        if (result.ok) {
            if (process.env.USE_NETLIFY_FORMS) {
                return {
                    statusCode: 200
                };
            } else {
                return {
                    statusCode: 303,
                    headers: {
                        "Location": "/success"
                    }
                };
            }
        } else {
            console.log(JSON.stringify(await result.json()));
            throw new Error("Viestin lähetys epäonnistui");
        }
    }

    return {
        statusCode: 400
    };
}
