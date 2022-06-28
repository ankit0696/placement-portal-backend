'use strict';

module.exports = {
    /**
     * Helper function to check if a student is eligible for a job
     * 
     * @param {Student} student Student data
     * @param {Job} job Job object which has to be checked 
     * @param {[Application]} selected_applications
     * - Array of applications, for which "the current student" has already been selected
     * 
     * @notes
     * - All parameters are mandatory
     * - selected_applications should contain "all" applications for which the student has
     *   already been selected, irrespective of any other condition, eg. FTE/Internship
     *   Example:
     *       const selected_applications = await strapi.db.query("api::application.application").findMany({
     *         where: {
     *             student: id,
     *             status: "selected"
     *         },
     *         populate: ["job"]
     *       });
     * 
     * @assumptions
     * - job.eligible_departments is a string of comma-separated department names,
     *   eg. "mathematics,computer science"
     * - job.eligible_programs is a string of comma-separated program names,
     *   eg. "B.Tech,M.Tech" (Single is also okay, in that case, comma is not required)
     * - job status terminology:
     *   - "open" - job is open for new applications
     *   - "ongoing" - no more applications, selection in process for older ones
     *   - "results_declared" - no more applications, results are declared
     *   - "abandoned" - no more applications, job is abandoned
     * 
     * @checks
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
     * - If job.only_for_ews, then only EWS students are eligible
     * - If job.only_for_pwd, then only PWD students are eligible
     * - If already selected in an "Internship" then ineligible for other "Internships"
     *
     * More conditions for "FTE" Jobs based on past applications:
     * - 1. If job.classification is "X", then the 'below' 3 conditions will be null and void
     * - 2. If selected in A1 => out of placement, not eligible
     * - 3. If selected in A2, then 3 more A1 applications allowed, AFTER selected in A2
     * - 4. If student receives 2 offers, not eligible for more applications
     *
     * @returns {boolean} If the student is eligible, this will return true
     */
    async helper_is_job_eligible(student, job, selected_applications) {
        // Instead of silently returning false, I am throwing an error, this may
        // cause some 500s initially, but will likely reduce silent eligibility
        // bugs in the long run
        const { id, X_marks, XII_marks, cpi, registered_for, department, program } = student;
        if (!id || !X_marks || !XII_marks || !cpi || !registered_for ||
            !department || !program) {
            throw `Some mandatory parameters not passed, or are null: ${student, job}`;
        }

        {
            // Basic job status checks
            if (job.approval_status != "approved") {
                return false /* Job has not yet been approved */;
            }

            if (job.job_status != "open") {
                return false /* Job is not open for applications */;
            }
        }

        {
            // Basic qualification checks
            if (job.min_X_marks > X_marks) {
                return false /* Xth marks less than minimum required */;
            }

            if (job.min_XII_marks > XII_marks) {
                return false /* XIIth marks less than minimum required */;
            }

            if (job.min_cpi > cpi) {
                return false /* CPI less than minimum required */;
            }

            if (job.category != registered_for) {
                return false /* Job's category is not the one student registered for */;
            }

            if(job.only_for_ews) {
                if(student.category != "ews") return false /* Job only for EWS */;
            }

            if(job.only_for_pwd) {
                if(student.pwd == false) return false /* Job only for PWD */;
            }
        }

        {
            // Filter based on job.eligible_programs
            if (job.eligible_programs) {
                // Case insensitive
                let lowercase_prog = program.toLowerCase();
                let lowercase_eligible_progs = job.eligible_programs.toLowerCase().split(",");

                // If NONE of the eligible departments match the student's department, then return false
                if (!lowercase_eligible_progs.includes(lowercase_prog)) {
                    return false /* Job is not for the student's program */;
                }
            }

            // Filter based on job.eligible_departments if it's not empty
            if (job.eligible_departments) {
                // Case insensitive
                let lowercase_dep = department.toLowerCase();
                let lowercase_eligible_deps = job.eligible_departments.toLowerCase().split(",");

                // If NONE of the eligible departments match the student's department, then return false
                if (!lowercase_eligible_deps.includes(lowercase_dep)) {
                    return false /* Job is not for the student's department */;
                }
            }
        }

        {
            // Filter based on job.start_date and job.last_date
            try {
                // If job.start_date is not empty, then check if it's in the future, if so return false
                if (job.start_date) {
                    let start_date = new Date(job.start_date);
                    if (start_date > new Date()) {
                        return false /* Start date yet to reach */;
                    }
                }

                if (job.last_date) {
                    let last_date = new Date(job.last_date);

                    if (last_date < Date.now()) {
                        return false /* Last date has passed */;
                    }
                }
            } catch (e) {
                console.log(
                    `WARNING: Job start_date or last_date is not a valid date:`,
                    `${job.start_date} or ${job.last_date}`
                );
            }
        }

        {
            // Check if student has already applied to this job
            const existing_application = await strapi.db.query("api::application.application")
                .findOne({
                    where: {
                        student: id,
                        job: job.id,
                    },
                });

            if (existing_application) return false /* Already applied */;
        }

	if ( job.classification == "Internship" ) {
            const existing_internship_selection = selected_applications
                .find(appl => appl.job.classification == "Internship");

            if (existing_internship_selection) {
                return false /* Already selected in an Internship */;
            }
	}

        if ( job.classification == "FTE" ) {
            // Check the extra conditions, based on already selected applications
            // console.debug({ selected_applications });

            // Date at which student was first selected in A2 (if any)
            const first_A2_application = selected_applications.find(appl => appl.job.category === "A2") || null;
            const date_A2_selection = first_A2_application ? Date.parse(first_A2_application.created_at) : null;

            // Number of applications to A1 jobs created by student, AFTER being selected in an A2 job
            // FUTURE: This calculation will get repeated for all jobs, see if it can be optimised
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

            const already_selected_A1 = (
                selected_applications
                    .find(appl => appl.job.classification === "A1") !== undefined
            );

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
                if (num_new_A1_application >= 3) {
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
        }

        return true /* All above conditions have passed */;
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
};

// ex: shiftwidth=4 expandtab:
