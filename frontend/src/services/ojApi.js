import apiClient from '../utils/apiClient'


const normalizeProblemId = (value) => (
  String(value ?? '').trim()
)


const unwrap = (response) => (
  response?.data ?? response
)


const listProblems = async () => {
  const response = await apiClient.get(
    '/oj/problems',
  )

  return unwrap(response)
}

const listContests = async () => unwrap(await apiClient.get('/oj/contests'))

const createContest = async (payload) => unwrap(await apiClient.post('/oj/contests', payload))

const updateContest = async (contestId, payload) => unwrap(await apiClient.put(`/oj/contests/${contestId}`, payload))


const getProblem = async (problemId) => {
  const response = await apiClient.get(
    `/oj/problems/${normalizeProblemId(problemId)}`,
  )

  return unwrap(response)
}


const createProblem = async (payload) => {
  const response = await apiClient.post(
    '/oj/problems',
    payload,
  )

  return unwrap(response)
}


const updateProblem = async (
  problemId,
  payload,
) => {
  const response = await apiClient.put(
    `/oj/problems/${normalizeProblemId(problemId)}`,
    payload,
  )

  return unwrap(response)
}


const addTestcase = async (
  problemId,
  payload,
) => {
  const response = await apiClient.post(
    `/oj/problems/${normalizeProblemId(problemId)}/testcases`,
    payload,
  )

  return unwrap(response)
}


const replaceTestcases = async (problemId, testcases) => {
  const response = await apiClient.put(
    `/oj/manage/problems/${normalizeProblemId(problemId)}/testcases`,
    { testcases },
  )

  return unwrap(response)
}


const getManagerProblem = async (problemId) => {
  const response = await apiClient.get(
    `/oj/manage/problems/${normalizeProblemId(problemId)}`,
  )

  return unwrap(response)
}


const updateTestcase = async (
  problemId,
  testcaseId,
  payload,
) => {
  const response = await apiClient.put(
    `/oj/manage/problems/${normalizeProblemId(problemId)}/testcases/${testcaseId}`,
    payload,
  )

  return unwrap(response)
}


const deleteTestcase = async (
  problemId,
  testcaseId,
) => {
  const response = await apiClient.delete(
    `/oj/manage/problems/${normalizeProblemId(problemId)}/testcases/${testcaseId}`,
  )

  return unwrap(response)
}



const submitProblem = async (
  problemId,
  payload,
) => {
  const response = await apiClient.post(
    `/oj/problems/${normalizeProblemId(problemId)}/submit`,
    payload,
  )

  return unwrap(response)
}


const listSubmissions = async (
  problemCode = '',
) => {
  const response = await apiClient.get(
    '/oj/submissions',
    {
      params: problemCode
        ? {
            problemCode:
              normalizeProblemId(problemCode),
          }
        : {},
    },
  )

  return unwrap(response)
}


const getSubmission = async (
  submissionId,
) => {
  const response = await apiClient.get(
    `/oj/submissions/${submissionId}`,
  )

  return unwrap(response)
}


const analyzeSubmission = async (
  submissionId,
) => {
  const response = await apiClient.post(
    `/oj/submissions/${submissionId}/analyze`,
  )

  return unwrap(response)
}


const submitReview = async (problemId, payload) => unwrap(await apiClient.post(`/oj/manage/problems/${normalizeProblemId(problemId)}/review`, payload))
const listReviews = async () => unwrap(await apiClient.get('/oj/manage/reviews'))
const decideReview = async (reviewId, payload) => unwrap(await apiClient.post(`/oj/manage/reviews/${reviewId}/decision`, payload))

const ojApi = {
  submitReview,
  listReviews,
  decideReview,
  listProblems,
  listContests,
  createContest,
  updateContest,
  getProblem,
  createProblem,
  updateProblem,
  addTestcase,
  replaceTestcases,
  getManagerProblem,
  updateTestcase,
  deleteTestcase,
  submitProblem,
  listSubmissions,
  getSubmission,
  analyzeSubmission,
}


export default ojApi
