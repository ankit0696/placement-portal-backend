const { helper_is_job_eligible, helper_get_applications } = require("../../student/controllers/util");

module.exports = {
    /**
     * @description Searches the jobs db to look for eligible jobs for given roll number
     *
     * @auth Admin only
     *
     * @queryParam {String} roll
     * 
     * @note This is a duplicate API of student.get_eligible_jobs, this is for admin, to get eligible jobs for a given roll number
     * @note If you want to know more about the logic, see student.get_eligible_jobs
     *
     * @example http://localhost:3000/api/admin/job/get_eligible_jobs?roll=1
     * 
     * @returns Array of job objects, each object containing detail for one job
     */
    async get_eligible_jobs(ctx) {
        const { roll } = ctx.query;

        if (!roll) {
            return ctx.badRequest("Missing roll number", { received_roll: roll || null });
        }

        const student_self = await strapi.db.query("api::student.student").findOne({
            where: {
                roll: roll,
            },
            populate: ["program", "course", "department"]
        });
        if (!student_self) {
            return ctx.notFound(null, [{ messages: [{ id: "Student not found" }] }]);
        }

        const { id, approved, X_marks, XII_marks, cpi, registered_for } = student_self;

        if (approved !== "approved") {
            return ctx.badRequest(null, [{ messages: [{ id: "Account not approved yet" }] }]);
        }

        if (cpi === undefined) {
            return ctx.badRequest(null, [{ messages: [{ id: "CPI not updated yet" }] }]);
        }

        let eligible_jobs = await strapi.db.query("api::job.job").findMany({
            where: {
                min_X_marks: { $lte: X_marks },
                min_XII_marks: { $lte: XII_marks },
                min_cpi: { $lte: cpi },
                approval_status: "approved",
                job_status: "open",
                category: registered_for,
            },
            populate: ["company", "jaf"]
        });

        if (!Array.isArray(eligible_jobs)) {
            return ctx.internalServerError(null, [{ messages: [{ id: "Could not get eligible jobs" }] }]);
        }

        // Check applications in which student has been selected
        const selected_applications = await strapi.db.query("api::application.application").findMany({
            where: {
                student: id,
                status: "selected"
            },
            populate: ["job"]
        });

        /**
         * `Array.filter` doesn't support async function write now, so using this 'trick'
         * 
         * @ref: https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
         */
        const is_eligible = await Promise.all(eligible_jobs.map(
            async (job) => (await helper_is_job_eligible(student_self, job, selected_applications))
        ));

        eligible_jobs = eligible_jobs.filter((_, index) => is_eligible[index]);

        ctx.body = eligible_jobs;
    },

    /**
     * @description Searches the applications collection to look for applied jobs for given roll number
     * Note: This function can also be used in admin routes, eg.
     * 
     * @queryParam {String} roll
     * 
     * @example http://localhost:3000/api/admin/job/applied-jobs?roll=1
     * @auth Admin only
     * 
     * @note This is a duplicate API of student.get_applied_jobs, this is for admin
     * 
     * @returns Array of applications, each object containing application for one job
     */
    async get_applied_jobs(ctx) {
        const { roll } = ctx.query;

        if (!roll) {
            return ctx.badRequest("Missing roll number", { received_roll: roll || null });
        }

        const applied_jobs = await helper_get_applications(roll);

        ctx.body = applied_jobs;
    },
};

// ex: shiftwidth=4 expandtab:
