import { MongoClient } from "mongodb";

let client;

async function getDb() {
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
  }

  return client.db(
    process.env.MONGODB_DB || "middle_eastern_mixing"
  );
}

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const {
      x,
      y,
      color,
      userId,
      username
    } = req.body || {};

    /* Validate coordinates */

    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x >= 200 ||
      y < 0 ||
      y >= 200
    ) {
      return res.status(400).json({
        error: "Invalid coordinates"
      });
    }

    /* Validate color */

    if (
      typeof color !== "string" ||
      !/^#[0-9a-fA-F]{6}$/.test(color)
    ) {
      return res.status(400).json({
        error: "Invalid color"
      });
    }

    if (!userId) {
      return res.status(401).json({
        error: "User is not authenticated"
      });
    }

    const db = await getDb();

    const users = db.collection("users");
    const pixels = db.collection("pixels");
    const bans = db.collection("bans");

    /* Check ban */

    const ban = await bans.findOne({
      userId,
      active: true
    });

    if (ban) {
      return res.status(403).json({
        error: "You are banned from drawing"
      });
    }

    /* Get user */

    let user = await users.findOne({
      _id: userId
    });

    /* Create user if they don't exist */

    if (!user) {

      user = {
        _id: userId,
        username: username || "Guest",
        balance: 100,
        pixelsPlaced: 0,
        clanId: null,
        lastPlacement: null,
        createdAt: new Date()
      };

      await users.insertOne(user);
    }

    /* Check balance */

    if ((user.balance || 0) <= 0) {
      return res.status(400).json({
        error: "You don't have any pixels"
      });
    }

    /* Cooldown */

    const cooldown = 60 * 1000;

    if (user.lastPlacement) {

      const elapsed =
        Date.now() -
        new Date(user.lastPlacement).getTime();

      if (elapsed < cooldown) {

        const remaining =
          Math.ceil(
            (cooldown - elapsed) / 1000
          );

        return res.status(429).json({
          error: "Pixel cooldown active",
          remaining
        });
      }
    }

    const pixelId = `${x}:${y}`;

    const existingPixel =
      await pixels.findOne({
        _id: pixelId
      });

    /*
      Clan protection.

      If both pixels belong to the same clan,
      teammates cannot paint over each other.
    */

    if (
      existingPixel &&
      existingPixel.clanId &&
      existingPixel.clanId === user.clanId
    ) {

      return res.status(403).json({
        error:
          "Your clan cannot paint over its own pixels"
      });
    }

    const now = new Date();

    /* Place pixel */

    await pixels.updateOne(
      {
        _id: pixelId
      },
      {
        $set: {
          x,
          y,
          color,
          userId,
          username: username || user.username || "Guest",
          clanId: user.clanId || null,
          placedAt: now
        }
      },
      {
        upsert: true
      }
    );

    /* Remove one pixel from balance */

    await users.updateOne(
      {
        _id: userId
      },
      {
        $inc: {
          balance: -1,
          pixelsPlaced: 1
        },
        $set: {
          lastPlacement: now,
          username: username || user.username || "Guest"
        }
      }
    );

    return res.status(200).json({
      success: true,
      pixel: {
        x,
        y,
        color,
        userId,
        username: username || user.username || "Guest",
        clanId: user.clanId || null,
        placedAt: now
      },
      balance: Math.max(
        0,
        (user.balance || 0) - 1
      )
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Failed to place pixel"
    });
  }
}
