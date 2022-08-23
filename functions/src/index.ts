import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

admin.initializeApp();

export const ringNearbyDrivers = functions.firestore
  .document("booking/{id}")
  .onCreate(async (snap) => {
    const docData = snap.data();
    const metricsDoc = await admin
      .firestore()
      .collection("metrics")
      .doc("metrics")
      .get();
    const metricsData = metricsDoc.data();

    if (docData != null && metricsData) {
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
              totalRides: FieldValue.increment(1),
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
                startLat: docData.startLat.toString(),
                startLng: docData.startLng.toString(),
                driverLat: driverData.lat.toString(),
                driverLng: driverData.lng.toString(),
                duration: duration,
                distance: distance,
                destination: dest_name,
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
                start_name: start_name,
                dest_name: dest_name,
                destination: docData.destination,
                driverStart: driverStart,
                distance: docData.distance,
                disttext: docData.disttext,
                duration: docData.duration,
                durtext: docData.durtext,
                price_per_km: metricsData.price_per_km,
                driverPickedAt: admin.firestore.FieldValue.serverTimestamp(),
                path: [],
                pathToStart: [],
              });
              break;
            }
            admin
              .firestore()
              .collection("drivers")
              .doc(driverDoc.id)
              .update({ ridesIgnored: FieldValue.increment(1) });
          }
        }
        //If we reached here that means no driver has accepted the ride so we must cancell it
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

export const saveRides = functions.firestore
  .document("rides/{id}")
  .onUpdate(async (snap) => {
    const docData = snap.after.data();
    const beforeData = snap.before.data();
    if (
      docData.cancelledByUser != beforeData.cancelledByUser ||
      docData.cancelledByDriver != beforeData.cancelledByDriver ||
      docData.finished != beforeData.finished
    ) {
      const userUid = docData.userUid;
      const driverUid = docData.driverUid;

      admin
        .firestore()
        .collection("users")
        .doc(userUid)
        .collection("rides")
        .doc(snap.after.id)
        .set(docData);
      admin
        .firestore()
        .collection("drivers")
        .doc(driverUid)
        .collection("rides")
        .doc(snap.after.id)
        .set(docData);
      if (docData.finished) {
        const totalPrice: number = docData.totalPrice;
        const metricsDoc = await admin
          .firestore()
          .collection("metrics")
          .doc("metrics")
          .get();
        const metricsData = metricsDoc.data()!;
        const tvaPercentage: number = metricsData.tvaPercentage;
        const revenuePercentage: number = metricsData.revenuePercentage;

        const tva = totalPrice * tvaPercentage;
        const revenue = totalPrice * revenuePercentage;
        const driverRevenue = totalPrice - tva - revenue;

        admin
          .firestore()
          .collection("drivers")
          .doc(driverUid)
          .collection("rides")
          .doc(snap.after.id)
          .update({
            tva: tva,
            revenue: revenue,
            driverRevenue: driverRevenue,
          });

        admin
          .firestore()
          .collection("drivers")
          .doc(driverUid)
          .update({
            totalAmount: FieldValue.increment(totalPrice),
            revenueToPay: FieldValue.increment(revenue),
            tvaToPay: FieldValue.increment(tva),
            driverRevenue: FieldValue.increment(driverRevenue),
            ridesFinished: FieldValue.increment(1),
          });
      }
      if (docData.cancelledByDriver) {
        admin
          .firestore()
          .collection("drivers")
          .doc(driverUid)
          .update({
            ridesCancelledByDriver: FieldValue.increment(1),
          });
      }

      if (docData.cancelledByUser) {
        admin
          .firestore()
          .collection("drivers")
          .doc(driverUid)
          .update({
            ridesCancelledByUser: FieldValue.increment(1),
          });
      }
    }
  });

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
