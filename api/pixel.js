import { MongoClient } from "mongodb";

let client;

const BOARD_SIZE = 200;
const PIXEL_COOLDOWN = 60 * 1000;

const ALLOWED_COLORS = new Set([
  "#000000",
  "#3b2a1f",
  "#765438",
  "#c8a45d",
  "#e7d7b5",
  "#f3e8cf",
  "#ffffff",
  "#9d3028",
  "#681d19",
  "#c46b2b",
  "#d4ad42",
  "#74733c",
  "#41613b",
  "#263c28",
  "#385a72",
  "#243746",
  "#5c4569",
  "#a86c79",
  "#77736b",
  "#383632"
]);

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

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.trim().split("=");

    if (key === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    /* -----------------------------
       AUTHENTICATION
    ----------------------------- */

    const sessionId = getCookie(req, "mem_session");

    if (!sessionId) {
      return res.status(401).json({
        error: "You must connect Discord before placing pixels."
      });
    }

    const db = await getDb();

    const sessions = db.collection("sessions");
    const users = db.collection("users");
    const pixels = db.collection("pixels");
    const bans = db.collection("bans");

    const session = await sessions.findOne({
      _id: sessionId
    });

    if (!session) {
      return res.status(401).json({
        error: "Your session is invalid. Please reconnect Discord."
      });
    }

    /* -----------------------------
       SESSION EXPIRATION
    ----------------------------- */

    if (
      session.expiresAt &&
      new Date(session.expiresAt).getTime() < Date.now()
    ) {
      await sessions.deleteOne({
        _id: sessionId
      });

      res.setHeader(
        "Set-Cookie",
        "mem_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
      );

      return res.status(401).json({
        error: "Your session has expired. Please reconnect Discord."
      });
    }

    const userId = session.userId;

    if (!userId) {
      return res.status(401).json({
        error: "Invalid session."
      });
    }

    /* -----------------------------
       VALIDATE REQUEST
    ----------------------------- */

    const {
      x,
      y,
      color
    } = req.body || {};

    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x >= BOARD_SIZE ||
      y < 0 ||
      y >= BOARD_SIZE
    ) {
      return res.status(400).json({
        error: "Invalid coordinates"
      });
    }

    if (
      typeof color !== "string" ||
      !ALLOWED_COLORS.has(color.toLowerCase())
    ) {
      return res.status(400).json({
        error: "Invalid color"
      });
    }

    const normalizedColor = color.toLowerCase();

    /* -----------------------------
       FIND USER
    ----------------------------- */

    const user = await users.findOne({
      _id: userId
    });

    if (!user) {
      return res.status(404).json({
        error: "User account not found."
      });
    }

    /* -----------------------------
       CHECK BAN
    ----------------------------- */

    const ban = await bans.findOne({
      userId,
      active: true
    });

    if (ban) {
      return res.status(403).json({
        error: "You are banned from drawing."
      });
    }

    /* -----------------------------
       BALANCE
    ----------------------------- */

    if ((user.balance || 0) <= 0) {
      return res.status(400).json({
        error: "You don't have any pixels available."
      });
    }

    /* -----------------------------
       COOLDOWN
    ----------------------------- */

    if (user.lastPlacement) {
      const elapsed =
        Date.now() -
        new Date(user.lastPlacement).getTime();

      if (elapsed < PIXEL_COOLDOWN) {
        const remaining = Math.ceil(
          (PIXEL_COOLDOWN - elapsed) / 1000
        );

        return res.status(429).json({
          error: "Pixel cooldown active",
          remaining
        });
      }
    }

    /* -----------------------------
       EXISTING PIXEL
    ----------------------------- */

    const pixelId = `${x}:${y}`;

    const existingPixel = await pixels.findOne({
      _id: pixelId
    });

    /* -----------------------------
       CLAN PROTECTION
    ----------------------------- */

    if (
      existingPixel &&
      existingPixel.clanId &&
      user.clanId &&
      existingPixel.clanId === user.clanId
    ) {
      return res.status(403).json({
        error:
          "Your clan cannot paint over its own pixels."
      });
    }

    const now = new Date();

    /* -----------------------------
       SAVE PIXEL
    ----------------------------- */

    await pixels.updateOne(
      {
        _id: pixelId
      },
      {
        $set: {
          x,
          y,
          color: normalizedColor,
          userId,
          username: user.username || "Discord User",
          clanId: user.clanId || null,
          placedAt: now
        }
      },
      {
        upsert: true
      }
    );

    /* -----------------------------
       REMOVE PIXEL FROM BALANCE
    ----------------------------- */

    const updatedUser = await users.findOneAndUpdate(
      {
        _id: userId,
        balance: {
          $gt: 0
        }
      },
      {
        $inc: {
          balance: -1,
          pixelsPlaced: 1
        },
        $set: {
          lastPlacement: now,
          updatedAt: now
        }
      },
      {
        returnDocument: "after"
      }
    );

    if (!updatedUser) {
      return res.status(400).json({
        error: "Unable to update pixel balance."
      });
    }

    return res.status(200).json({
      success: true,

      pixel: {
        x,
        y,
        color: normalizedColor,
        userId,
        username: user.username || "Discord User",
        clanId: user.clanId || null,
        placedAt: now
      },

      balance: updatedUser.balance ?? 0,

      pixelsPlaced:
        updatedUser.pixelsPlaced ?? 0,

      cooldown: PIXEL_COOLDOWN
    });

  } catch (error) {
    console.error(
      "Pixel placement error:",
      error
    );

    return res.status(500).json({
      error: "Failed to place pixel",
      message: error.message
    });
  }
}
