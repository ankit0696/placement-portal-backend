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
            select: ["approved", "X_percentage", "XII_percentage"]
        });
        if (!student_self) {
            return ctx.badRequest(null, [{ messages: [{ id: "No student found" }] }]);
        }

        const { approved, X_percentage, XII_percentage } = student_self;

        if (approved !== "approved") {
            return ctx.badRequest(null, [{ messages: [{ id: "Account not approved yet" }] }]);
        }

        const eligible_jobs = await strapi.db.query("api::job.job").findMany({
            where: {
                min_X_percentage: {
                    $lte: X_percentage
                },
                min_XII_percentage: {
                    $lte: XII_percentage
                }
            }
        });

        ctx.body = eligible_jobs;
    }

};
