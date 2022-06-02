module.exports = {
  routes: [
    {
      method: "GET",
      path: "/student/me",
      handler: "student.findMe",
      policies: [],
    },
    {
      method: "GET",
      path: "/student/eligiblejobs",
      handler: "student.getEligibleJobs",
      policies: [],
    },
    {
      method: "POST",
      path: "/student/register",
      handler: "student.register",
      policies: []
    },
    {
      method: "POST",
      path: "/student/submit-for-approval",
      handler: "student.submit_for_approval",
      policies: []
    }
  ],
};
