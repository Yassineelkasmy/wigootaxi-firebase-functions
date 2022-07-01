import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

export const ringNearbyDrivers = functions.firestore
  .document("booking/{id}")
  .onCreate(async (snap, context) => {
    const docData = snap.data();
    // var chosenDriver = "";
    if (docData != null) {
      const candidatesUids: string[] = docData.candidatesUids;
      const dest_name = docData.dest_name;
      const userUid = docData.userUid;
      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(userUid)
        .get();

      const userData = userDoc.data();
      if (userData) {
        candidatesUids.forEach(async (uid) => {
          const driverDoc = await admin
            .firestore()
            .collection("drivers")
            .doc(uid)
            .get();
          const driverData = driverDoc.data();
          if (driverData != undefined) {
            await driverDoc.ref.update({
              booking_call: snap.id,
              booking: {
                ...docData,
                id: snap.id,
                user: { ...userData, id: userDoc.id },
              },
            });
            admin.messaging().sendToTopic(uid, {
              notification: {
                content_available: "true",
                click_action: "FLUTTER_NOTIFICATION_CLICK",
                badge: "1",
                title: dest_name,
                body: userData.username,
                sound: "default",
                priority: "high",
                icon: "",
                type: "Editorial",
              },

              data: {
                // type: "league",
              },
            });

            await delay(10000);
            await admin
              .firestore()
              .collection("drivers")
              .doc(uid)
              .update({ booking_call: null, booking: null });
            const rideDoc = await admin
              .firestore()

              .collection("booking")
              .doc(snap.id)
              .get();
            const rideDocData = rideDoc.data();
            if (rideDocData && rideDocData.booking_call) {
              return;
            }
          }
        });
      }
    }
  });

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
