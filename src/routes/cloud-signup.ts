import express from 'express';
import * as EmailValidator from 'email-validator';
import psl from 'psl';
import { getFirebaseSingleton } from '../helpers';
import {v4 as uuid} from 'uuid';

const router = express.Router();

router.post("/schools", async (req, res) => {
    const fullName = req.body['fullName'];
    const workEmail = req.body['email'];

    const instituteName = req.body['instituteName'];
    const instituteType = req.body['instituteType'];
    const institutePrimaryDomain = req.body['instituteDomain'];

    if ([
        fullName,
        workEmail,
        instituteName,
        instituteType,
        institutePrimaryDomain,
    ].some(e => !e)) {
        res.sendStatus(400);
        return;
    }

    if (!EmailValidator.validate(workEmail)) {
        res.status(400).send("Invalid email address.");
        return;
    }

    const parsedDomain = psl.parse(institutePrimaryDomain);
    if (parsedDomain.error || !parsedDomain.listed) {
        res.status(400).send("Invalid primary domain.");
        return;
    }

    const admin = getFirebaseSingleton();
    const school = admin.firestore()
        .collection('schools')
        .doc();

    const setupToken = uuid();

    try {
        await admin.firestore().runTransaction(async transaction => {
            const existingSchool = await transaction.get(
                admin.firestore()
                    .collection('schools')
                    .where('auth.domains', 'array-contains', institutePrimaryDomain),
            );

            if (!existingSchool.empty) {
                res.status(409).send("Domain already in use.");
                throw new Error("response_sent");
            }

            transaction.set(school, {
                name: instituteName,
                auth: {
                    domains: [institutePrimaryDomain],
                    setupToken,
                },
                resources: {
                    CPUs: 0.5,
                    RAM: 100,
                },
            });
        });
    } catch (e) {
        if (e.message === "response_sent") return;
        res.sendStatus(500);
        return;
    }

    res.status(200).json({
        schoolId: school.id,
        setupToken,
    });
});

export default router;
