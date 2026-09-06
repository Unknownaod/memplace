import { MongoClient } from "mongodb";

let client;

async function getDb() {

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing");
  }

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


/* ==========================================
   GET COOKIE
========================================== */

function getCookie(req, name) {

  const cookieHeader =
    req.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookies =
    cookieHeader.split(";");

  for (const cookie of cookies) {

    const [
      key,
      ...valueParts
    ] =
      cookie.trim().split("=");

    if (key === name) {

      return decodeURIComponent(
        valueParts.join("=")
      );

    }

  }

  return null;
}


/* ==========================================
   GET ADMIN IDS
========================================== */

function getAdminIds() {

  return (
    process.env.ADMIN_USER_IDS || ""
  )
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);

}


/* ==========================================
   ADMIN API
========================================== */

export default async function handler(
  req,
  res
) {

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "Method not allowed"
    });

  }


  try {

    /* ======================================
       CHECK SESSION
    ====================================== */

    const sessionId =
      getCookie(
        req,
        "mem_session"
      );

    if (!sessionId) {

      return res.status(401).json({
        error:
          "You must connect Discord."
      });

    }


    const db =
      await getDb();


    const sessions =
      db.collection("sessions");

    const users =
      db.collection("users");

    const bans =
      db.collection("bans");

    const adminLogs =
      db.collection("adminLogs");


    /* ======================================
       FIND SESSION
    ====================================== */

    const session =
      await sessions.findOne({
        _id: sessionId
      });


    if (!session) {

      return res.status(401).json({
        error:
          "Invalid session. Please reconnect Discord."
      });

    }


    /* ======================================
       CHECK SESSION EXPIRATION
    ====================================== */

    if (
      session.expiresAt &&
      new Date(
        session.expiresAt
      ).getTime() < Date.now()
    ) {

      await sessions.deleteOne({
        _id: sessionId
      });


      res.setHeader(
        "Set-Cookie",
        "mem_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
      );


      return res.status(401).json({
        error:
          "Your session has expired."
      });

    }


    const adminUserId =
      session.userId;


    /* ======================================
       VERIFY ADMIN
    ====================================== */

    const adminIds =
      getAdminIds();


    if (
      !adminIds.includes(
        adminUserId
      )
    ) {

      return res.status(403).json({
        error:
          "You do not have permission to use the admin panel."
      });

    }


    /* ======================================
       VERIFY ADMIN ACCOUNT EXISTS
    ====================================== */

    const adminUser =
      await users.findOne({
        _id: adminUserId
      });


    if (!adminUser) {

      return res.status(403).json({
        error:
          "Admin account not found."
      });

    }


    /* ======================================
       REQUEST DATA
    ====================================== */

    const {
      action,
      userId
    } = req.body || {};


    if (
      !action ||
      !userId
    ) {

      return res.status(400).json({
        error:
          "Missing parameters"
      });

    }


    /* ======================================
       PREVENT ADMIN SELF-BAN
    ====================================== */

    if (
      action === "ban" &&
      userId === adminUserId
    ) {

      return res.status(400).json({
        error:
          "You cannot ban yourself."
      });

    }


    /* ======================================
       BAN USER
    ====================================== */

    if (
      action === "ban"
    ) {

      const targetUser =
        await users.findOne({
          _id: userId
        });


      if (!targetUser) {

        return res.status(404).json({
          error:
            "User not found"
        });

      }


      const now =
        new Date();


      await bans.updateOne(

        {
          userId
        },

        {
          $set: {
            userId,
            active: true,
            bannedAt: now,
            bannedBy: adminUserId
          }
        },

        {
          upsert: true
        }

      );


      await adminLogs.insertOne({

        action:
          "ban",

        targetUserId:
          userId,

        adminUserId,

        createdAt:
          now

      });


      return res.status(200).json({
        success: true
      });

    }


    /* ======================================
       UNBAN USER
    ====================================== */

    if (
      action === "unban"
    ) {

      const targetUser =
        await users.findOne({
          _id: userId
        });


      if (!targetUser) {

        return res.status(404).json({
          error:
            "User not found"
        });

      }


      const now =
        new Date();


      await bans.updateOne(

        {
          userId
        },

        {
          $set: {
            active: false,
            unbannedAt: now,
            unbannedBy: adminUserId
          }
        }

      );


      await adminLogs.insertOne({

        action:
          "unban",

        targetUserId:
          userId,

        adminUserId,

        createdAt:
          now

      });


      return res.status(200).json({
        success: true
      });

    }


    /* ======================================
       GIVE PIXELS
    ====================================== */

    if (
      action === "givePixels"
    ) {

      const amount =
        Number(
          req.body.amount
        );


      if (
        !Number.isInteger(
          amount
        ) ||
        amount <= 0 ||
        amount > 100000
      ) {

        return res.status(400).json({
          error:
            "Invalid amount"
        });

      }


      const result =
        await users.updateOne(

          {
            _id: userId
          },

          {
            $inc: {
              balance:
                amount
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
          error:
            "User not found"
        });

      }


      const now =
        new Date();


      await adminLogs.insertOne({

        action:
          "givePixels",

        targetUserId:
          userId,

        adminUserId,

        amount,

        createdAt:
          now

      });


      return res.status(200).json({

        success: true,

        added:
          amount

      });

    }


    /* ======================================
       UNKNOWN ACTION
    ====================================== */

    return res.status(400).json({
      error:
        "Unknown action"
    });


  } catch (error) {

    console.error(
      "Admin API error:",
      error
    );


    return res.status(500).json({
      error:
        "Admin operation failed"
    });

  }

}

