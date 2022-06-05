module.exports = {
  routes: [
    {
      method: "GET",
      path: "/student/me",
      handler: "student.findMe",
      policies: [],
    },
    {
      method: "POST",
      path: "/student/submit-for-approval",
      handler: "student.submit_for_approval",
      policies: []
    },
    {
      method: "PUT",
      path: "/student/modify",
      handler: "student.modify_multiple",
      policies: []
    },
    {
      method: "GET",
      path: "/student/eligiblejobs",
      handler: "job.get_eligible_jobs",
      policies: [],
    },
    {
      method: "POST",
      path: "/student/apply",
      handler: "job.apply_to_job",
      policies: [],
    },
    {
      method: "GET",
      path: "/student/applied-jobs",
      handler: "job.get_applied_jobs",
      policies: [],
    }
  ],
};
