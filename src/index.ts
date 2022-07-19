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
        var candidatePicked = false;
        for (let n = 0; n < candidatesUids.length; n++) {
          const uid = candidatesUids[n];
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
            await admin.messaging().sendToTopic(uid, {
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
                type: "booking",
                username: userData.username,
                place: docData.start_name,
              },
            });

            //Wait for 10s as a timeout for driver to accept the ride
            await delay(15000);

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

            // Cheking if the driver has acctualy accepted the ride
            if (rideDocData && rideDocData.driverId) {
              candidatePicked = true;
              await admin.firestore().collection("rides").doc(snap.id).set({
                driverUid: driverDoc.id,
                userUid: userDoc.id,
                start: docData.start,
                destination: docData.destination,
              });
              break;
            }
          }
        }
        //If we reached here that means no drivet has accepted the ride so we must cancell it
        if (!candidatePicked) {
          snap.ref.update({ cancelled: true });
        }
      }
    }
  });

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
