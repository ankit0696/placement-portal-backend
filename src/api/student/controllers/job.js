'use strict';

module.exports = {
    // TODO: Try reducing redundant code
    async helper_is_job_eligible() {

    },

    /**
     * Helper Function: To get applications of student, to tell which jobs the student has applied to,
     * (regardless of the application status)
     * 
     * Note: This function can also be used in admin routes, eg. /api/admin/job/applied-jobs?roll=190430
     * 
     * @param {string/number} roll - Roll number of the student, whose applications are to be fetched 
     * @returns 
     */
    async helper_get_applications(roll) {
        const student_self = await strapi.db.query("api::student.student").findOne({
            where: {
                roll: roll,
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

        return applied_jobs;
    },

    /**
     * @description Searches the jobs db to look for eligible jobs for current student
     * 
     * @note There's also a similar API for admin, to get eligible jobs for a given roll number
     *
     * @checks
     * - student is logged in
     * - student record with roll number exists
     * - student is approved by admin
     *
     * @job_checks
     * To be eligible for a job:
     * - job minimum marks are less than or equal to student's marks, X, XII, CPI
     * - job is eligible for student's program, eg B.Tech
     * - job is eligible for student's department
     * - job category matches student's registerd_for category, eg. Internship/FTE
     * - job is approved by admin
     * - job status is open
     * - job start datetime is less than current datetime
     * - job last datetime is greater than current datetime
     * - job is not already applied by student
     *
     * More conditions based on past applications:
     * - 1. If job.classification is "X", then the 'below' 3 conditions will be null and void
     * - 2. If selected in A1 => out of placement, not eligible
     * - 3. If selected in A2, then 3 more A1 applications allowed, AFTER selected in A2
     * - 4. If student receives 2 offers, not eligible for more applications
     *
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
            select: ["id", "approved", "X_marks", "XII_marks", "cpi", "program", "department", "registered_for"]
        });
        if (!student_self) {
            return ctx.notFound(null, [{ messages: [{ id: "Student not found" }] }]);
        }

        const { id, approved, X_marks, XII_marks, cpi, program, department, registered_for } = student_self;

        if (approved !== "approved") {
            return ctx.badRequest(null, [{ messages: [{ id: "Account not approved yet" }] }]);
        }

        if (cpi === undefined) {
            return ctx.badRequest(null, [{ messages: [{ id: "CPI not updated yet" }] }]);
        }

        let eligible_jobs = await strapi.db.query("api::job.job").findMany({
            where: {
                min_X_marks: {
                    $lte: X_marks
                },
                min_XII_marks: {
                    $lte: XII_marks
                },
                min_cpi: {
                    $lte: cpi
                },

                // Only jobs that are approved will be shown to student
                approval_status: "approved",

                // Only jobs open to applications will be shown to student
                job_status: "open",

                // Filter based on if user registered for "Internship" or "FTE"
                category: registered_for,
            },
            populate: ["company", "jaf"]
        });

        if (!eligible_jobs || !Array.isArray(eligible_jobs)) {
            return ctx.internalServerError(null, [{ messages: [{ id: "Could not get eligible jobs" }] }]);
        }

        // Assumption: job.eligible_departments is a string of comma-separated
        // CASE-INSENSITIVE department names, eg. "mathematics,computer science"
        eligible_jobs = eligible_jobs.filter(job => {
            // Filter based on job.eligible_programs
            // eligible_programs is a mandatory field in Job collection,
            // and must contain name of only 1 program, eg. B.Tech
            // TODO
            // eligible_programs: program,


            // Filter based on job.eligible_departments if it's not empty
            if (job.eligible_departments) {
                // Case insensitive
                let lowercase_dep = department.toLowerCase();
                let lowercase_eligible_dep = job.eligible_departments.toLowerCase().split(",");

                // If NONE of the eligible departments match the student's department, then return false
                if (!lowercase_eligible_dep.includes(lowercase_dep)) {
                    return false;
                }
            }

            // Filter based on job.start_date and job.last_date
            try {
                // If job.start_date is not empty, then check if it's in the future, if so return false
                if (job.start_date) {
                    let start_date = new Date(job.start_date);
                    if (start_date > new Date()) {
                        return false;
                    }
                }

                let last_date = new Date(job.last_date);

                if (last_date < Date.now()) {
                    return false;
                }
            } catch (e) {
                console.log(`WARNING: Job start_date or last_date is not a valid date: ${job.start_date} or ${job.last_date}`);
            }

            return true;
        });

        // Check applications in which student has been selected
        const selected_applications = await strapi.db.query("api::application.application").findMany({
            where: {
                student: id,
                status: "selected"
            },
            populate: ["job"]
        });
        console.log({ selected_applications });

        // Date at which student was first selected in A2 (if any)
        const first_A2_application = selected_applications.find(appl => appl.job.category === "A2") || null;
        const date_A2_selection = first_A2_application ? Date.parse(first_A2_application.created_at) : null;

        // Number of applications to A1 jobs created by student, AFTER being selected in an A2 job
        const num_new_A1_application = (await strapi.db.query("api::application.application").findMany({
            where: {
                student: id,
                job: { classification: "A1" }
            },
        })).filter(application => {
            if (date_A2_selection) {
                return Date.parse(application.createdAt) > date_A2_selection;
            }
            return true;
        }).length;

        console.log({ date_A2_selection, num_new_A1_application });

        const already_selected_A1 = (
            selected_applications
                .find(appl => appl.job.classification === "A1") !== undefined
        );

        /**
         * `exists` is an array of bools, representing whether a job has been already applied for
         * 
         * @ref: https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
         */
        const exists = await Promise.all(eligible_jobs.map(async (job) => {
            // Ensure condition 1 in "More conditions"
            if (job.classification === "X") {
                return true;
            }

            // Ensure condition 2 in "More conditions"
            if (already_selected_A1) {
                console.debug(`Roll: ${user.username}, Ineligible, Reason: Selected in A1`);
                return false;
            }

            // Ensure condition 3 in "More conditions".
            if (first_A2_application != null) {
                // If selected in A2 already, then other A2 jobs not eligible now
                if (job.classification === "A2") {
                    console.debug(`Roll: ${user.username}, Ineligible, Reason: Selected in A2`);
                    return false;
                }

                // Checking for 3 A1 applications condition
                if (number_of_A1_applications >= 3) {
                    console.debug(`Roll: ${user.username}, Ineligible, Reason: Already applied for 3 A1 jobs`);
                    return false;
                }
            }

            // Ensures condition 4 in "More conditions"
            if (selected_applications.length >= 2) {
                // Not eligible in any jobs
                console.debug(`Roll: ${user.username}, Ineligible, Reason: Already selected for 2 jobs`);
                return false;
            }

            const existing_application = await strapi.db.query("api::application.application").findOne({
                where: {
                    student: id,
                    job: job.id,
                },
                // populate: true   (Not required, just checking if it exists)
            });

            // console.log("For", {job: job.job_title, existing_application});
            if (!existing_application) {
                // Not yet applied, so eligible
                return true;
            } else {
                console.debug(`Roll: ${user.username}, Ineligible, Reason: Already applied for job`);
                return false;
            }
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
                category: registered_for,
                status: "active"
            },
            populate: ["company", "jaf"]
        });

        ctx.body = all_jobs;
    },

    /**
     * @description Apply to a job passing the job id
     * @example http://localhost:1337/api/student/apply?jobId=2
     * @note requires authentication
     * @returns 200 status on success, else error codes possibly with a body {messages: [{id:'msg'}]}
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

        // NOTE: The "id" here maybe different than user.id,
        // since that refers to id in Users collection, 
        // and this is in the Students collection
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
                id: query.jobId,
            },
            populate: true
        });

        if (!job) {
            return ctx.badRequest(null, [{ messages: [{ id: "No such job Id found" }] }]);
        }

        // Check for job status
        if (job.status !== "active") {
            return ctx.badRequest(null, [{ messages: [{ id: "Job is not active, or may not be open yet" }] }]);
        }

        // console.log({ id, approved, X_marks, XII_marks, registered_for, date: Date.now() });
        // console.log(job);

        if (X_marks >= job.min_X_marks && XII_marks >= job.min_XII_marks && registered_for == job.category) {
            try {
                // Check if current datetime is more than job's last datetime
                if (Date.now() > Date.parse(job.last_date)) {
                    return ctx.badRequest(null[{ messages: [{ id: "Last date to apply has passed" }] }]);
                }
            } catch (err) {
                console.debug(`[job: apply]: Job: ${job.job_title} may have invalid last date: ${job.last_date}`, { err });
            }

            const existing_application = await strapi.db.query("api::application.application").findOne({
                student: id,
                job: query.jobId
            });

            if (existing_application) {
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

        if (!user || !user.username) {
            return ctx.badRequest(null, [{ messages: [{ id: "Bearer Token not provided or invalid" }] }]);
        }
        const applied_jobs = this.helper_get_applications(user.username);

        ctx.body = applied_jobs;
    },
};

// ex: shiftwidth=4 expandtab:
