const { helper_is_job_eligible, helper_get_applications } = require("../../student/controllers/util");
const AdmZip = require("adm-zip");
const { readFileSync } = require("fs");
const path = require("path");

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

    /**
     * @description Returns a zip of resumes of multiple students
     *
     * @queryParam {String} rolls - It should be a string, containing comma-separated roll numbers
     * @note Empty zip if rolls is empty, but atleast passed in query params
     *
     * @returns Zip of resumes of multiple students
     */
    async resume_zip(ctx) {
        const { rolls } = ctx.query;

        if (!rolls) {
            return ctx.badRequest("Missing roll numbers", { received_rolls: rolls || null });
        }

        let roll_arr = rolls.split(',').map(s => s.trim()).filter(s => (s.length!==0));

        // Removing duplicates from `roll_arr`
        roll_arr = roll_arr.filter((r,i) => roll_arr.indexOf(r) == i);

        // Creating an empty zip (in-memory)
        const zip = new AdmZip();
        // roll_arr.forEach is async, so using Promise.all
        await Promise.all(roll_arr.map(async (roll) => {
            const student = await strapi.db.query("api::student.student").findOne({
                where: {
                    roll: roll,
                },
                populate: ["resume"]
            });
            console.log({student});

            // If any student roll number is invalid, just return 400
            if (!student) {
                return ctx.badRequest(null, [{ messages: [{ id: `Student ${roll} not found` }] }]);
            }

            // Ignore if student has no resume
            if (student.resume) {
                // FUTURE: Truly using asynchronously can make the whole call faster
                // Join "../../../../public/" and student.resume.url
                // TODO: Make it work on production too, how to find path to `public` folder?
                const file_path = path.join(__dirname, "../../../../public/", student.resume.url);
                const buff = readFileSync(file_path);
                // Name of the file is the roll number.pdf
                zip.addFile(`${roll}.pdf`, buff);
            }
        }));

        // FUTURE:
        // 1. Custom name ?
        // 2. Check if it fails ? Though even that case it's simply 500, and error will be on logs
        ctx.body = zip.toBuffer();
    }
};

// ex: shiftwidth=4 expandtab:
