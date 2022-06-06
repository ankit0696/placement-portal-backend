'use strict';

module.exports = {
    /**
     * @description Searches the jobs db to look for eligible jobs for current student
     * @returns Array of job objects, each object containing detail for one job
     */
    async get_eligible_jobs(ctx) {
        const user = ctx.state.user;

        if (!user) {
            return ctx.badRequest(null, [{ messages: [{ id: "Bearer Token not provided or invalid" }] }]);
        }
        const student_self = await strapi.db.query("api::student.student").findOne({
            where: {
                roll: user.username,
            },
            select: ["id", "approved", "X_marks", "XII_marks", "registered_for"]
        });
        if (!student_self) {
            return ctx.badRequest(null, [{ messages: [{ id: "No student found" }] }]);
        }

        const { id, approved, X_marks, XII_marks, registered_for } = student_self;

        if (approved !== "approved") {
            return ctx.badRequest(null, [{ messages: [{ id: "Account not approved yet" }] }]);
        }

        let eligible_jobs = await strapi.db.query("api::job.job").findMany({
            where: {
                min_X_marks: {
                    $lte: X_marks
                },
                min_XII_marks: {
                    $lte: XII_marks
                },
                last_date: {
                    $gte: Date.now()
                },
                category: registered_for
            },
            populate: ["company", "jaf"]
        });

        if (!eligible_jobs || !Array.isArray(eligible_jobs)) {
            return ctx.internalServerError(null, [{ messages: [{ id: "Could not get eligible jobs" }] }]);
        }

        /**
         * `exists` is an array of bools, representing whether a job has been already applied for
         * 
         * @ref: https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
         */
        const exists = await Promise.all(eligible_jobs.map(async (job) => {
            const existing_application = await strapi.db.query("api::application.application").findOne({
                student: id,
                job: job.id
            });

            if (!existing_application) {
                // Not yet applied
                return true;
            }
            return false;
        }));

        eligible_jobs = eligible_jobs.filter((_, index) => exists[index]);

        ctx.body = eligible_jobs;
    },

    /**
 * @description Searches all jobs according to registered_for current student
 * @returns Array of job objects, each object containing detail for one job
 */
    async get_all_jobs(ctx) {
        const user = ctx.state.user;

        if (!user) {
            return ctx.badRequest(null, [{ messages: [{ id: "Bearer Token not provided or invalid" }] }]);
        }
        const student_self = await strapi.db.query("api::student.student").findOne({
            where: {
                roll: user.username,
            },
            select: ["approved", "registered_for"]
        });
        if (!student_self) {
            return ctx.badRequest(null, [{ messages: [{ id: "No student found" }] }]);
        }

        const { approved, registered_for } = student_self;

        if (approved !== "approved") {
            return ctx.badRequest(null, [{ messages: [{ id: "Account not approved yet" }] }]);
        }

        const all_jobs = await strapi.db.query("api::job.job").findMany({
            where: {
                category: registered_for
            },
            populate: ["company", "jaf"]
        });

        ctx.body = all_jobs;
    },

    /**
     * @description Apply to a job passing the job id
     * @example http://localhost:1337/api/student/apply?jobId=2
     * @note requires authentication
     * @returns 200 status on success, else error codes possibly with a body {messsages: [{id:'msg'}]}
     */
    async apply_to_job(ctx) {
        const user = ctx.state.user;

        if (!user) {
            return ctx.badRequest(null, [{ messages: [{ id: "Bearer Token not provided or invalid" }] }]);
        }

        const query = ctx.request.query;
        if (!query || !(query.jobId)) {
            return ctx.badRequest(null, [{ messages: [{ id: "Required jobId in query" }] }]);
        }

        /* NOTE: The "id" here maybe different than user.id, since that refers to id in Users collection, and this is in the Students collection */
        const student_self = await strapi.db.query("api::student.student").findOne({
            where: {
                roll: user.username,
            },
            select: ["id", "approved", "X_marks", "XII_marks", "registered_for"]
        });
        if (!student_self) {
            return ctx.badRequest(null, [{ messages: [{ id: "No student found" }] }]);
        }

        const { id, approved, X_marks, XII_marks, registered_for } = student_self;

        if (approved !== "approved") {
            return ctx.badRequest(null, [{ messages: [{ id: "Account not approved yet" }] }]);
        }

        const job = await strapi.db.query("api::job.job").findOne({
            where: {
                id: query.jobId
            },
            populate: true
        });

        if (!job) {
            return ctx.badRequest(null, [{ messages: [{ id: "No such job Id found" }] }]);
        }

        if (X_marks >= job.min_X_marks && XII_marks >= job.min_XII_marks && (Date.now() <= job.last_date) && registered_for == job.category) {
            const existing_application = await strapi.db.query("api::application.application").findOne({
                student: id,
                job: query.jobId
            });

            if (!existing_application) {
                return ctx.badRequest(null, [{ messages: [{ id: "Already applied" }] }]);
            }

            const application = await strapi.db.query("api::application.application").create({
                data: {
                    status: "applied",
                    student: id,
                    job: query.jobId
                },
                populate: ["job"]
            });

            if (!application) {
                return ctx.internalServerError(null, [{ messages: [{ id: "Failed to create application" }] }]);
            }

            ctx.body = application;
        } else {
            return ctx.badRequest(null, [{ messages: [{ id: "Not eligible" }] }]);
        }
    },

    /**
     * @description Searches the applications collection to look for applied jobs for current student
     * @example http://localhost:1337/api/student/applied-jobs
     * @note requires authentication
     * @returns Array of applications, each object containing application for one job
     */
    async get_applied_jobs(ctx) {
        const user = ctx.state.user;

        if (!user) {
            return ctx.badRequest(null, [{ messages: [{ id: "Bearer Token not provided or invalid" }] }]);
        }
        const student_self = await strapi.db.query("api::student.student").findOne({
            where: {
                roll: user.username,
            },
            select: ["id", "approved"]
        });
        if (!student_self) {
            return ctx.badRequest(null, [{ messages: [{ id: "No student found" }] }]);
        }

        const { id, approved } = student_self;

        if (approved !== "approved") {
            return ctx.badRequest(null, [{ messages: [{ id: "Account not approved yet" }] }]);
        }

        const applied_jobs = await strapi.db.query("api::application.application").findMany({
            where: {
                student: id,
            },
            populate: ["student", "job.company", "job.jaf"]
        });

        ctx.body = applied_jobs;
    },
};
