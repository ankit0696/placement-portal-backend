module.exports = {
    /**
     * @description Searches the jobs db to look for eligible jobs for given roll number
     *
     * @auth Admin only
     *
     * @queryParam {String} roll
     * 
     * @note This is a duplicate API of student.get_eligible_jobs, this is for admin, to get eligible jobs for a given roll number
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
                roll: roll
            },
            select: ["id", "approved", "X_marks", "XII_marks", "cpi", "program", "department", "registered_for"]
        });
        if (!student_self) {
            return ctx.notFound(null, [{ messages: [{ id: 'Student not found' }] }]);
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
                // NOTE: eligible_departments is handled after this query
                // NOTE2: eligible_program is mandatory field in Job collection, and must contain name of only 1 program, eg. B.Tech
                eligible_program: program,
                status: "active",
                // TODO: Find ways to query this, not working at all for now
                // For now doing comparison with last date later in this function
                // last_date: {
                //     $gte: (new Date)
                // },

                // Filter based on if user registered for "Internship" or "FTE"
                category: registered_for,
            },
            populate: ["company", "jaf"]
        });
        // console.log(eligible_jobs);

        // console.log({ id, approved, X_marks, XII_marks, registered_for, date: Date.now(), is_in_future: "2022-06-08T18:49:23.001Z" < Date.now(), eligible_jobs });

        if (!eligible_jobs || !Array.isArray(eligible_jobs)) {
            return ctx.internalServerError(null, [{ messages: [{ id: "Could not get eligible jobs" }] }]);
        }

        // Assumption: job.eligible_departments is a string of comma separated CASE-INSENSITIVE department names, eg. "mathematics,computer science"
        eligible_jobs = eligible_jobs.filter(job => {
            // Filter based on job.eligible_departments if it's not empty
            if (job.eligible_departments) {
                // Case insensitive
                let lowercase_dep = department.toLowerCase();
                return job.eligible_departments.split(",").map(dep => dep.toLowerCase()).includes(lowercase_dep);
            } else {
                return true;
            }
        });

        // Check applications in which student has been selected
        const selected_jobs = await strapi.db.query("api::application.application").findMany({
            where: {
                student: id,
                status: "selected"
            },
            populate: ["job"]
        });

        const number_of_A1_applications = await strapi.db.query("api::application.application").count({
            where: {
                student: id,
                // TODO: Add logic to not count applications that are in "rejected" status, IF THIS IS REQUIRED BY SPECS
            }
        });

        /**
         * `exists` is an array of bools, representing whether a job has been already applied for
         * 
         * @ref: https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
         */
        const exists = await Promise.all(eligible_jobs.map(async (job) => {
            try {
                // Check if current datetime is more than job's last datetime (ie. apply date passed)
                if (Date.now() > Date.parse(job.last_date)) {
                    console.debug(`Roll: ${roll}, Ineligible, Reason: Date passed`);
                    return false;
                }
            } catch (err) {
                console.debug(`[job: get_eligible_jobs]: Job: ${job.job_title} may have invalid last date: ${job.last_date}`, { err });
            }

            // Ensure that these conditions are met:
            // 1. If job.classification is "X", then the 'below conditions' will be null and void, except required qualifications which are already checked, so return true
            // 2. If selected in A1, out of placement, not eligible in future
            // 3. If selected in B1, then 3 more A1 applications allowed, AFTER selected in B1
            // 4. If student receives 2 offers, not eligible for more applications
            // TODO: Some of these conditions can be moved out of this loop
            // Ensure condition 1 above
            if (job.classification === "X") {
                return true;
            }

            // Ensure condition 2 above
            if (selected_jobs.find(selected_job => selected_job.job.classification === "A1") !== undefined) {
                // Student has selected in A1
                console.debug(`Roll: ${roll}, Ineligible, Reason: Selected in A1`);
                return false;
            }

            // Ensure condition 3 above... checking for 3 A1 applications part to be done at apply function
            if (selected_jobs.find(selected_job => selected_job.job.classification === "B1") != undefined) {
                // If selected in B1 already, then other B1 jobs not eligible now
                if (job.classification === "B1") {
                    console.debug(`Roll: ${roll}, Ineligible, Reason: Selected in B1`);
                    return false;
                }

                if (number_of_A1_applications >= 3) {
                    console.debug(`Roll: ${roll}, Ineligible, Reason: Already applied for 3 A1 jobs`);
                    return false;
                }
            }

            // Ensures condition 4 above
            if (selected_jobs.length >= 2) {
                // Not eligible in any jobs
                console.debug(`Roll: ${roll}, Ineligible, Reason: Already selected for 2 jobs`);
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
                console.debug(`Roll: ${roll}, Ineligible, Reason: Already applied for job`);
                return false;
            }
        }));

        eligible_jobs = eligible_jobs.filter((_, index) => exists[index]);

        ctx.body = eligible_jobs;
    },
};

// ex: shiftwidth=4 expandtab:
