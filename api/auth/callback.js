import { MongoClient } from "mongodb";
import crypto from "crypto";

let client;

async function getDb() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing");
  }

  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
  }

  return client.db(
    process.env.MONGODB_DB || "middle_eastern_mixing"
  );
}

function createSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("Missing Discord authorization code.");
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Discord OAuth environment variables are missing");
    }

    // Exchange Discord authorization code for an access token
    const tokenResponse = await fetch(
      "https://discord.com/api/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri
        })
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Discord token error:", tokenData);

      return res.status(400).send(
        "Discord authorization failed."
      );
    }

    // Get the Discord user's identity
    const userResponse = await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    const discordUser = await userResponse.json();

    if (!userResponse.ok) {
      console.error("Discord user error:", discordUser);

      return res.status(400).send(
        "Unable to retrieve your Discord account."
      );
    }

    const db = await getDb();

    const users = db.collection("users");

    const now = new Date();

    // Create/update user
    await users.updateOne(
      {
        _id: discordUser.id
      },
      {
        $set: {
          username: discordUser.global_name ||
            discordUser.username,
          discordUsername: discordUser.username,
          avatar: discordUser.avatar || null,
          updatedAt: now
        },
        $setOnInsert: {
          balance: 100,
          pixelsPlaced: 0,
          clanId: null,
          lastPlacement: null,
          createdAt: now
        }
      },
      {
        upsert: true
      }
    );

    // Create session
    const sessionId = createSessionId();

    await db.collection("sessions").insertOne({
      _id: sessionId,
      userId: discordUser.id,
      createdAt: now,
      expiresAt: new Date(
        Date.now() + 1000 * 60 * 60 * 24 * 30
      )
    });

    // Secure HttpOnly cookie
    const cookie = [
      `mem_session=${sessionId}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=2592000"
    ].join("; ");

    res.setHeader("Set-Cookie", cookie);

    // Return user to the website
    return res.redirect(
      302,
      "/?discord=connected"
    );

  } catch (error) {
    console.error("Discord callback error:", error);

    return res.status(500).send(
      "Something went wrong while connecting Discord."
    );
  }
}
