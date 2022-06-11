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
            select: ["id", "approved", "X_marks", "XII_marks", "registered_for"]
        });
        if (!student_self) {
            return ctx.notFound(null, [{ messages: [{ id: 'Student not found' }] }]);
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

        // console.log({ id, approved, X_marks, XII_marks, registered_for, date: Date.now(), is_in_future: "2022-06-08T18:49:23.001Z" < Date.now() });

        if (!eligible_jobs || !Array.isArray(eligible_jobs)) {
            return ctx.internalServerError(null, [{ messages: [{ id: "Could not get eligible jobs" }] }]);
        }

        /**
         * `exists` is an array of bools, representing whether a job has been already applied for
         * 
         * @ref: https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
         */
        const exists = await Promise.all(eligible_jobs.map(async (job) => {
            try {
                // Check if current datetime is more than job's last datetime (ie. apply date passed)
                if (Date.now() > Date.parse(job.last_date)) {
                    return false;
                }
            } catch (err) {
                console.debug(`[job: get_eligible_jobs]: Job: ${job.job_title} may have invalid last date: ${job.last_date}`, { err });
            }
            const existing_application = await strapi.db.query("api::application.application").findOne({
                where: {
                    student: id,
                    job: job.id,
                }
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
};

// ex: shiftwidth=4 expandtab:
