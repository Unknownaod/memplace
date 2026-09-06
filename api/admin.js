import { MongoClient } from "mongodb";

let client;

async function getDb() {

  if (!client) {

    client =
      new MongoClient(
        process.env.MONGODB_URI
      );

    await client.connect();

  }

  return client.db(
    process.env.MONGODB_DB ||
    "middle_eastern_mixing"
  );

}


export default async function handler(
  req,
  res
) {

  if (
    req.method !== "POST"
  ) {

    return res.status(405).json({
      error: "Method not allowed"
    });

  }


  try {

    const {
      action,
      userId
    } = req.body || {};


    if (
      !action ||
      !userId
    ) {

      return res.status(400).json({
        error: "Missing parameters"
      });

    }


    const db =
      await getDb();


    const users =
      db.collection("users");

    const bans =
      db.collection("bans");

    const adminLogs =
      db.collection("adminLogs");


    /* =============================
       BAN USER
    ============================= */

    if (
      action === "ban"
    ) {

      await bans.updateOne(

        {
          userId
        },

        {
          $set: {
            userId,
            active: true,
            bannedAt: new Date()
          }
        },

        {
          upsert: true
        }

      );


      await adminLogs.insertOne({

        action: "ban",

        targetUserId:
          userId,

        createdAt:
          new Date()

      });


      return res.status(200).json({
        success: true
      });

    }


    /* =============================
       UNBAN USER
    ============================= */

    if (
      action === "unban"
    ) {

      await bans.updateOne(

        {
          userId
        },

        {
          $set: {
            active: false,
            unbannedAt:
              new Date()
          }
        }

      );


      await adminLogs.insertOne({

        action: "unban",

        targetUserId:
          userId,

        createdAt:
          new Date()

      });


      return res.status(200).json({
        success: true
      });

    }


    /* =============================
       GIVE PIXELS
    ============================= */

    if (
      action === "givePixels"
    ) {

      const amount =
        Number(req.body.amount);


      if (
        !Number.isInteger(amount) ||
        amount <= 0 ||
        amount > 100000
      ) {

        return res.status(400).json({
          error: "Invalid amount"
        });

      }


      const result =
        await users.updateOne(

          {
            _id: userId
          },

          {
            $inc: {
              balance: amount
            },

            $set: {
              updatedAt:
                new Date()
            }

          }

        );


      if (
        result.matchedCount === 0
      ) {

        return res.status(404).json({
          error: "User not found"
        });

      }


      await adminLogs.insertOne({

        action:
          "givePixels",

        targetUserId:
          userId,

        amount,

        createdAt:
          new Date()

      });


      return res.status(200).json({
        success: true,
        added: amount
      });

    }


    return res.status(400).json({
      error: "Unknown action"
    });


  } catch (error) {

    console.error(
      "Admin API error:",
      error
    );


    return res.status(500).json({
      error: "Admin operation failed"
    });

  }

}

