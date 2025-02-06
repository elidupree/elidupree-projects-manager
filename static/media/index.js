
//const canvas = document.getElementById ("canvas")
//const context = canvas.getContext ("2d")
const password_input = document.getElementById ("password")
const main_interface_element = document.getElementById ("main_interface")
const collection_element = document.getElementById ("collection")
const tasks_element = document.getElementById ("tasks")

let socket = null
let interface_ready = false
let selected_task_id = null
const tasks_map = new Map()
const ongoing_drags = new Map()

const task_info_inputs = {}

// "view locations" are CSS pixels relative to the center of the view
// "collection locations" are in arbitrary coordinates
let collection_location_of_view_center = [0, 0]
let collection_units_per_view_unit = 1

function zipWith(arrays, fn) {
    const result = []
    for (let i = 0; arrays.every(a => a.length > i); i++) {
        result.push(fn(arrays.map(a => a[i])))
    }
    return result
}

function view_location_to_collection_location(view_location) {
    return zipWith([view_location, collection_location_of_view_center], (p => p[1] + p[0]*collection_units_per_view_unit))
}

function collection_location_to_view_location(collection_location) {
    return zipWith([collection_location, collection_location_of_view_center], (p => (p[0] - p[1]) / collection_units_per_view_unit))
}

function eventlike_view_location(event) {
    const bounds = tasks_element.getBoundingClientRect()
    return [event.clientX - bounds.left, event.clientY - bounds.top]
}

function eventlike_collection_location(event) {
    return view_location_to_collection_location(eventlike_view_location(event))
}

collection_element.addEventListener("wheel", (event) => {
    const ratio = Math.pow(2, event.deltaY/300)
    collection_location_of_view_center = zipWith([eventlike_collection_location(event), collection_location_of_view_center], p => p[0] + (p[1]-p[0]) * ratio)
    collection_units_per_view_unit *= ratio
    for (task of tasks_map.values()) {
        update_task_ui(task)
    }
})

function send(variant, contents) {
    if (socket !== null && socket.readyState == 1) {
        socket.send(JSON.stringify({[variant]: contents}))
    }
}

for (const input of document.querySelectorAll("#task_info [name]")) {
    task_info_inputs[input.name] = input
}

let suppress_next_click = false

tasks_element.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (suppress_next_click) {
        suppress_next_click = false
        return
    }
    const new_task = {
        id: crypto.randomUUID(),

        short_name: "",
        long_name: "",
        description: "",

        location: eventlike_collection_location(event),
        parent: null,
        relationships: [],

        status: "NotStarted",
        work_types: [],
        activity_history: [new Date(Date.now()).toISOString()],
    }
    update_task_ui(new_task)
    set_selected (new_task.id)
    send("CreateTask", new_task)
})

function set_selected(task_id) {
    const old_element = document.getElementById (selected_task_id);
    if (old_element) {old_element.classList.remove ("selected")}
    selected_task_id = task_id
    document.getElementById (task_id).classList.add("selected")
}

function update_task_info_panel() {
    const selected_task = tasks_map.get(selected_task_id)
    if (selected_task !== undefined) {
        for (const field of ["short_name", "long_name", "description"]) {
            task_info_inputs[field].value = selected_task[field]
        }
    }
}

let pending_update = null
function clear_pending_update() {
    if (pending_update !== null) {
        clearTimeout(pending_update)
        pending_update = null
    }
}
function queue_pending_update() {
    clear_pending_update()
    pending_update = setTimeout(flush_pending_update, 200)
}
function flush_pending_update() {
    if (pending_update !== null) {
        update_task_data_from_info_panel()
    }
}
function update_task_data_from_info_panel() {
    clear_pending_update()
    const selected_task = tasks_map.get(selected_task_id)
    if (selected_task !== undefined) {
        for (const field of ["short_name", "long_name", "description"]) {
            selected_task[field] = task_info_inputs[field].value
        }
        send("UpdateTask", selected_task)
    }
}

function update_task_ui (task) {
    tasks_map.set(task.id, task)
    let task_element = document.getElementById (task.id)
    if (task_element === null) {
        task_element = document.createElement("div")
        task_element.id = task.id
        task_element.className = "task"
        task_element.addEventListener("click", (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (suppress_next_click) {
                suppress_next_click = false
                return
            }
            set_selected(task_element.id)
        })
        task_element.addEventListener("mousedown", (event) => {
            start_dragging_task(task.id, "mouse", event_view_location(event))
            event.preventDefault()
            event.stopPropagation()
        })
        task_element.addEventListener("touchstart", (event) => {
            for (const touch of event.changedTouches) {
                start_dragging_task(task.id, touch.identifier, touch.pageX, touch.pageY)
            }
            event.preventDefault()
            event.stopPropagation()
        })
        tasks_element.appendChild(task_element)
    }
    task_element.innerText = task.short_name
    const location = collection_location_to_view_location(task.location)
    task_element.style.left = location[0]+"px"
    task_element.style.top = location[1]+"px"
}

function start_dragging_task(task_id, drag_id, pointer_location) {
    const existing = ongoing_drags.get(task_id)
    if (existing !== undefined) {
        // Steal from the existing one, I guess
        existing.pointer_location = pointer_location.slice()
        existing.drag_id = drag_id
    }
    else {
        const task = tasks_map.get(task_id)
        ongoing_drags.set(task_id, {
            task_id,
            drag_id,
            pointer_location: pointer_location.slice(),
            original_pointer_location: pointer_location.slice(),
            task_original_collection_location: task.location.slice(),
            disturbed: false,
        })
    }
    console.log("started drag", ongoing_drags)
}

function continue_dragging_task(drag, pointer_location) {
    const threshold = 5
    if (zipWith([pointer_location, drag.original_pointer_location], (p,o) => Math.abs(p - o)).some(d => d > threshold)) {
        drag.disturbed = true
    }
    if (drag.disturbed) {
        const task = tasks_map.get(drag.task_id)
        for (const i of [0,1]) {
            task.location[i] += (pointer_location[i] - drag.pointer_location[i]) * collection_units_per_view_unit
        }
        update_task_ui(task)
    }
    drag.pointer_location = pointer_location.slice()
//    console.log("continued drag")
}

function cancel_dragging_task (drag) {
    const task = tasks_map.get(drag.task_id)
    task.location[0] = drag.original_pointer_location.slice()
    send("UpdateTask", task)
    ongoing_drags.delete(drag.task_id)
}

function finish_dragging_task (drag) {
    const task = tasks_map.get(drag.task_id)
    send("UpdateTask", task)
    console.log(ongoing_drags.delete(drag.task_id))
    console.log("finished drag", ongoing_drags)
}

collection_element.addEventListener("mousemove", (event) => {
    for (const [task_id, drag] of ongoing_drags) {
        if (drag.drag_id === "mouse") {
            continue_dragging_task(drag, eventlike_view_location(event))
            event.preventDefault()
        }
    }
})
collection_element.addEventListener("touchmove", (event) => {
    for (const touch of event.changedTouches) {
        for (const [task_id, drag] of ongoing_drags) {
            if (drag.drag_id === touch.identifier) {
                continue_dragging_task(drag, eventlike_view_location(touch))
                event.preventDefault()
            }
        }
    }
})

collection_element.addEventListener("mouseup", (event) => {
    for (const [task_id, drag] of ongoing_drags) {
        if (drag.drag_id === "mouse") {
            if (drag.disturbed) {
                suppress_next_click = true
            }
            finish_dragging_task(drag)
            event.preventDefault()
        }
    }
})
collection_element.addEventListener("touchend", (event) => {
    for (const touch of event.changedTouches) {
        for (const [task_id, drag] of ongoing_drags) {
            if (drag.drag_id === touch.identifier) {
                finish_dragging_task(drag)
                event.preventDefault()
            }
        }
    }
})

collection_element.addEventListener("touchcancel", (event) => {
    for (const touch of event.changedTouches) {
        for (const [task_id, drag] of ongoing_drags) {
            if (drag.drag_id === touch.identifier) {
                cancel_dragging_task(drag)
            }
        }
    }
})

for (const [name,input] of Object.entries(task_info_inputs)) {
    input.addEventListener("change", update_task_data_from_info_panel)
    input.addEventListener("input", queue_pending_update)
}

const message_handlers = {}

message_handlers.UpdateRecords = (collection) => {
    for (task of collection.tasks) {
        update_task_ui(task)
    }
    update_task_info_panel()
}

function connect(password) {
    if (socket) { socket.close() }
    socket = new WebSocket(`wss://${location.host}/session`)

    socket.onopen = () => {
      console.log('Connected')
      socket.send(password)
    }

    socket.onmessage = (ev) => {
        if (!interface_ready) {
            interface_ready = true;
            password_input.style.display = "none";
            main_interface.style.display = "block";
        }
//        console.log('Received: ' + ev.data)
        const message = JSON.parse (ev.data)
        console.log('Received: ', message)
        for (const [k,v] of Object.entries(message)) {
            message_handlers[k](v);
        }
    }

    socket.onclose = () => {
        console.log('Disconnected')
    }

}

function password_entered() {
    const password = password_input.value
    connect(password)
    window.localStorage.setItem("elidupree-projects-password", password)
}

const saved_password = window.localStorage.getItem("elidupree-projects-password")
if (saved_password !== null) {
    connect(saved_password)
}

password_input.addEventListener("change", password_entered)
