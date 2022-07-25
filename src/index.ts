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
      const start_name = docData.start_name;
      const duration = docData.durtext;
      const distance = docData.disttext;
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
              bookingUserUid: userDoc.id,
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
                start: start_name,
                destination: dest_name,
                duration: duration,
                distance: distance,
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
            console.log(docData.driverStart);
            if (rideDocData && rideDocData.driverId) {
              candidatePicked = true;
              const updatedBookingDoc = await admin
                .firestore()
                .collection("booking")
                .doc(snap.id)
                .get();
              const driverStart = updatedBookingDoc.data()!.driverStart;
              await admin.firestore().collection("rides").doc(snap.id).set({
                driverUid: driverDoc.id,
                userUid: userDoc.id,
                start: docData.start,
                destination: docData.destination,
                driverStart: driverStart,
                driverPickedAt: admin.firestore.FieldValue.serverTimestamp(),
                path: [],
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

export const notifyDriverArrivalhRide = functions.firestore
  .document("rides/{id}")
  .onUpdate(async (snap) => {
    const beforeData = snap.before.data();
    const afterData = snap.after.data();

    if (!beforeData.driverArrived && afterData.driverArrived) {
      const userUid = afterData.userUid;
      const bookData = await (
        await admin.firestore().collection("booking").doc(snap.after.id).get()
      ).data();

      const start_name = bookData!.start_name;
      admin.messaging().sendToTopic(userUid, {
        notification: {
          content_available: "true",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
          badge: "1",
          title: "Chauffeur arrivé!",
          body: "Le chauffeur vous attend au " + start_name,
          sound: "default",
          priority: "high",
          icon: "",
          type: "Editorial",
        },
      });
    }
  });
function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
