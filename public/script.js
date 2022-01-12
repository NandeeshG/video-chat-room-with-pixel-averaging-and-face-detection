const WIDTH = 720
const HEIGHT = 560
const TIMER_MILLISECONDS = 100
const SQUARE_SIDE = 25
const FRAME_RATE = 30

//let videoElem, canvasElem
let intervals = []

const videoGrid = document.getElementById('video-grid')
const canvasGrid = document.getElementById('canvas-grid')

const socket = io('/')
const peer = new Peer('someid', {
    secure: true,
    host: 'video-chat-room-with-pixel-averaging.herokuapp.com',
    port: 443,
})
//const peer = new Peer(undefined, {
//    host: '/',
//    port: '3001',
//})

const myVideo = document.createElement('video')
myVideo.muted = true
//myVideo.width = 0
//myVideo.height = 0

let myCanvas = document.createElement('canvas')
myCanvas.width = WIDTH
myCanvas.height = HEIGHT

const peers = {}

//async function main() {
//    const devicesList = await getAllDevices()
//    makeButtonList(devicesList, videoElem, null)
//}

socket.on('user-disconnected', (userId) => {
    console.log('user left ', userId)
    if (peers[userId]) peers[userId].close()
})

peer.on('open', (userId) => {
    console.log('joined room with id', ROOM_ID, ' : ', userId)
    socket.emit('join-room', ROOM_ID, userId)
})

function addVideoStream(video, stream) {
    video.srcObject = stream
    video.addEventListener('loadedmetadata', () => {
        video.play()
    })
    videoGrid.append(video)
}

function connectToNewUser(userId, stream) {
    const call = peer.call(userId, stream)
    const video = document.createElement('video')
    call.on('stream', (userVideoStream) => {
        addVideoStream(video, userVideoStream)
    })
    call.on('close', () => {
        video.remove()
    })
    peers[userId] = call
}

//define start video stream function
async function setVideoStream(id) {
    try {
        let str = await navigator.mediaDevices.getUserMedia({
            video: {
                width: WIDTH,
                height: HEIGHT,
                deviceId: id,
            },
            audio: false,
        })
        myVideo.srcObject = str
        myVideo.autoplay = true
        myVideo.addEventListener('loadedmetadata', () => {
            myVideo.play()
        })

        console.log('got stream and set it to myVideo')

        canvasGrid.append(myCanvas)
        console.log('appended canvas')

        addEventListenerOnVideoElem(myVideo, myCanvas)

        let stream = myCanvas.captureStream(FRAME_RATE)
        //stream = addVideoStream(myVideo, stream)
        console.log('captured stream')

        peer.on('call', (call) => {
            console.log('call received ', call)
            call.answer(stream)
            const video = document.createElement('video')
            call.on('stream', (userVideoStream) => {
                addVideoStream(video, userVideoStream)
            })
        })

        socket.on('user-connected', (userId) => {
            console.log('user connected ', userId)
            connectToNewUser(userId, stream)
        })

        //canvasVideoPlayback(canvasElem, videoElem)
    } catch (err) {
        console.log(err)
    }
}

Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri('/models')]).then(
    setVideoStream('', myVideo, myCanvas)
)

function addEventListenerOnVideoElem(videoElem, canvasElem) {
    //Start facedetection
    videoElem.addEventListener('playing', () => {
        console.log('myvideo playing')
        const displaySize = { width: WIDTH, height: HEIGHT }

        let interval = setInterval(async () => {
            const detections = await faceapi.detectAllFaces(
                videoElem,
                new faceapi.TinyFaceDetectorOptions()
            )
            const resizedDetections = faceapi.resizeResults(
                detections,
                displaySize
            )

            let boxes = []
            for (let i = 0; i < resizedDetections.length; ++i) {
                boxes.push({
                    fx: resizedDetections[i]._box._x,
                    fy: resizedDetections[i]._box._y,
                    fw: resizedDetections[i]._box._width,
                    fh: resizedDetections[i]._box._height,
                })
            }
            console.log('calling pixelAvg')
            pixelAveraging(boxes, videoElem, canvasElem)
        }, TIMER_MILLISECONDS)

        //intervals.push(interval)
    })
}

// Pixel averaging functions -------
function pixelAveraging(boxes, videoElem, canvasElem) {
    let context = canvasElem.getContext('2d')
    context.drawImage(videoElem, 0, 0, WIDTH, HEIGHT)

    ////face boxes
    for (let i = 0; i < boxes.length; ++i) {
        context.strokeStyle = 'green'
        context.strokeRect(boxes[i].fx, boxes[i].fy, boxes[i].fw, boxes[i].fh)
    }

    let frame = context.getImageData(0, 0, WIDTH, HEIGHT)

    for (let i = 0; i < WIDTH; i += SQUARE_SIDE) {
        for (let j = 0; j < HEIGHT; j += SQUARE_SIDE) {
            let cont = false
            for (let b = 0; b < boxes.length; ++b) {
                const fx = boxes[b].fx
                const fy = boxes[b].fy
                const fw = boxes[b].fw
                const fh = boxes[b].fh
                if (
                    withinBox(i, j, fx, fy, fw, fh) ||
                    withinBox(
                        i + SQUARE_SIDE,
                        j + SQUARE_SIDE,
                        fx,
                        fy,
                        fw,
                        fh
                    ) ||
                    withinBox(i, j + SQUARE_SIDE, fx, fy, fw, fh) ||
                    withinBox(i + SQUARE_SIDE, j, fx, fy, fw, fh)
                ) {
                    cont = true
                    break
                }
            }
            if (cont === true) continue
            let ids = []
            for (let ii = 0; ii < SQUARE_SIDE; ++ii) {
                for (let jj = 0; jj < SQUARE_SIDE; ++jj) {
                    ids.push(getId(i + ii, j + jj, WIDTH, HEIGHT))
                }
            }

            let avgs = [0, 0, 0, 0] //rgba
            for (let k = 0; k < 4; k++) {
                avgs[k] = colorAverage(k, ids, frame.data)
            }

            for (let k = 0; k < 4; k++) {
                setColor(k, avgs[k], ids, frame.data)
            }
        }
    }
    console.log('new image on canvas')
    context.putImageData(frame, 0, 0)
}

function setColor(k, col, ids, data) {
    if (ids.length == 0) return 0
    for (let i = 0; i < ids.length; ++i) {
        data[ids[i] + k] = col
    }
}

function colorAverage(k, ids, data) {
    if (ids.length == 0) return 0
    let sum = 0
    for (let i = 0; i < ids.length; ++i) {
        sum += data[ids[i] + k]
    }
    return sum / ids.length
}

//get array index from x,y,w,h
function getId(
    x /*0 based col num*/,
    y /*0 based row num*/,
    w /*number of pixels on width*/,
    h /*no. of pixels of height*/
) {
    let rowBeg = 4 * w * y
    let id = rowBeg + 4 * x
    return id
}

function withinBox(x, y, fx, fy, fw, fh) {
    return x >= fx && x <= fx + fw && y >= fy && y <= fy + fh
}
