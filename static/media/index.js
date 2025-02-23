
//const canvas = document.getElementById ("canvas")
//const context = canvas.getContext ("2d")
const password_input = document.getElementById ("password")
const main_interface_element = document.getElementById ("main_interface")
const collection_element = document.getElementById ("collection")
const tasks_element = document.getElementById ("tasks")
const all_tasks_bounds_element = document.getElementById ("all_tasks_bounds")
const task_info_inputs = {}
for (const input of document.querySelectorAll("#task_info [name]")) {
    task_info_inputs[input.name] = input
}
const task_status_element = document.getElementById("task_status")
const task_tags_element = document.getElementById("task_tags")
const task_status_buttons = new Map()
for (const status of ["Indefinite", "NotStarted", "InProgress", "PartiallyCompleted", "Completed", "Obviated", "NeverIntended"]) {
    const element = document.createElement("button")
    element.textContent = status
    element.addEventListener("click", event => {
        const selected_task = tasks_map.get(selected_task_id)
        if (selected_task !== undefined) {
            selected_task.status = status
            log_automatic_update(selected_task, "ChangedStatus")
            send("UpdateTask", selected_task)
        }
    })
    task_status_element.appendChild (element)
    task_status_buttons.set(status, element)
}

let socket = null
let interface_ready = false
let selected_task_id = null
const tasks_map = new Map()
const container_ui_cache_map = new Map()
let global_tags = []
const ongoing_drags = new Map()

// "view locations" are CSS pixels relative to the center of the view
// "collection locations" are in arbitrary coordinates
const global_view = {
    view_location_of_inner_origin: [0, 0],
    view_units_per_inner_unit: 1,
}

function zipWith(arrays, fn) {
    const result = []
    for (let i = 0; arrays.every(a => a.length > i); i++) {
        result.push(fn(arrays.map(a => a[i])))
    }
    return result
}

function view_location_to_inner_location(view, view_location) {
    return zipWith([view_location, view.view_location_of_inner_origin], (p => (p[0] - p[1]) / view.view_units_per_inner_unit))
}

function inner_location_to_view_location(view, inner_location) {
    return zipWith([inner_location, view.view_location_of_inner_origin], (p => p[1] + p[0]*view.view_units_per_inner_unit))
}

function view_upon_task_to_view_upon_children(view, task) {
    return {
        view_location_of_inner_origin: inner_location_to_view_location(view, task.location),
        view_units_per_inner_unit: view.view_units_per_inner_unit * task.my_environment_units_per_child_environment_unit,
    }
}

//function view_within_task(task, include_drags) {
//    if (task === null || task === undefined) {
//        return global_view
//    }
//
//
//    if (include_drags) {
//        const drag = ongoing_drags.get (task.id)
//        if (drag?.disturbed) {
//            return drag.imposed_view_within_task
//        }
//    }
//
//    const view_upon_task = view_within_task(tasks_map.get(task.parent_id), include_drags)
//    const view_location_of_inner_origin = inner_location_to_view_location(view_upon_task, task.location)
//    return {
//        view_location_of_inner_origin,
//        view_units_per_inner_unit: view_upon_task.view_units_per_inner_unit * task.my_environment_units_per_child_environment_unit,
//    }
//}

//function view_location_of_task(task, include_drags) {
//    return view_within_task(task, include_drags).view_location_of_inner_origin
//}

function eventlike_view_location(event) {
    const bounds = tasks_element.getBoundingClientRect()
    return [event.clientX - bounds.left, event.clientY - bounds.top]
}

//function eventlike_collection_location(event) {
//    return view_location_to_inner_location(global_view, eventlike_view_location(event))
//}

collection_element.addEventListener("wheel", (event) => {
    const ratio = Math.pow(0.5, event.deltaY/300)
    global_view.view_location_of_inner_origin = zipWith([eventlike_view_location(event), global_view.view_location_of_inner_origin], p => p[0] + (p[1]-p[0]) * ratio)
    global_view.view_units_per_inner_unit *= ratio
    update_container_ui(null)
    event.preventDefault()
})

function location_add (a, b) {
    return zipWith([a, b], p => p[0] + p[1])
}

function location_sub (a, b) {
    return zipWith([a, b], p => p[0] - p[1])
}

function send(variant, contents) {
    if (socket !== null && socket.readyState == 1) {
        socket.send(JSON.stringify({[variant]: contents}))
    }
}

let suppress_next_click = false

function create_task(parent_id, view_location) {
    const parent_cache = container_ui_cache_map.get(parent_id)
    const new_task = {
        id: crypto.randomUUID(),

        short_name: "",
        long_name: "",
        description: "",

        location: view_location_to_inner_location(parent_cache.view_within, view_location),
        parent_id,
        my_environment_units_per_child_environment_unit: 1,
        relationships: [],

        status: "NotStarted",
        tags: [],
        updates: [{
            datetime: new Date(Date.now()).toISOString(),
            kind: "Created",
        }],
    }
    tasks_map.set(new_task.id, new_task)
    container_ui_cache_map.set(new_task.id, {children:[]})
    parent_cache.children.push(new_task)
    update_container_ui(null)
    set_selected(new_task.id)
    send("CreateTask", new_task)
}

collection_element.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (suppress_next_click) {
        suppress_next_click = false
        return
    }
    set_selected(null)
})

let mouse_raw_location = [0,0]
let mouse_view_location = [0,0]
document.addEventListener("mousemove", event => {
    mouse_raw_location = [event.clientX, event.clientY]
    mouse_view_location = eventlike_view_location(event)
})
function container_id_under_mouse() {
    let element = document.elementFromPoint(...mouse_raw_location)
    let parent
    let parent_id
    while (true) {
        parent = tasks_map.get(element.id)
        if (parent !== undefined) {
            return element.id
        }
        if (element.id === collection_element.id) {
            return null
        }
        element = element.parent
        if (element === undefined) {
            // TODO: handle how this means you're not in the collection
            return null
        }
    }
}
document.addEventListener("keydown", (event) => {
//    console.log(event.key, event.target)
    if (event.target.tagName !== "BODY") {
        return
    }
    if (event.key == "c") {
        event.preventDefault()
        create_task(container_id_under_mouse(), mouse_view_location)
    }
    if (event.key == "m") {
        const selected_task = tasks_map.get(selected_task_id)
        if (selected_task !== undefined) {
            event.preventDefault()
            // TODO fix hack: relying on server to update for the UI to remain consistent
            selected_task.parent_id = container_id_under_mouse()
            const view_location = container_ui_cache_map.get(selected_task_id).view_within.view_location_of_inner_origin
            selected_task.location = view_location_to_inner_location(container_ui_cache_map.get(selected_task.parent_id).view_within, view_location)
            send("UpdateTask", selected_task)
        }
    }
})



function set_selected(task_id) {
    const old_element = document.getElementById (selected_task_id);
    if (old_element) {old_element.classList.remove ("selected")}
    selected_task_id = task_id
    if (task_id !== null) {
      document.getElementById(task_id).classList.add("selected")
    }
    update_task_info_panel()
}

function log_automatic_update(task, update_kind) {
    const now = Date.now()

    // if the task was just created, assume anything in the first hour is just the initial information
    const created_time = new Date(task.updates[0].datetime).getTime()
    if (now - created_time < 1000*60*60) {
        return
    }

    // assume that any info-updates with less than half-hour gaps between them count as a single update – delete the old ones.
    for (let i = task.updates.length - 1; i >= 0; i--) {
        const update = task.updates[i]
        const update_time = new Date(update.datetime).getTime()
        if (now - update_time > 1000*60*30) {
            break
        }
        if (update.kind === update_kind) {
            task.updates.splice(i, 1)
        }
    }

    task.updates.push({
        datetime: new Date(now).toISOString(),
        kind: update_kind,
    })
}

function update_task_info_panel() {
    task_tags_element.innerHTML = ""
    for (const [status, button] of task_status_buttons) {
        button.classList.remove("selected")
    }
    const selected_task = tasks_map.get(selected_task_id)
    if (selected_task !== undefined) {
        for (const field of ["short_name", "long_name", "description"]) {
            task_info_inputs[field].value = selected_task[field]
        }
        task_status_buttons.get(selected_task.status).classList.add("selected")

        for (const tag of global_tags) {
            const element = document.createElement("button")
            element.textContent = tag
            element.addEventListener("click", event => {
                const existing_index = selected_task.tags.indexOf(tag)
                if (existing_index === -1) {
                    selected_task.tags.push (tag)
                } else {
                    selected_task.tags.splice (existing_index, 1)
                }
                log_automatic_update(selected_task, "ChangedInfo")
                send("UpdateTask", selected_task)
            })
            if (selected_task.tags.includes(tag)) {
                element.classList.add ("selected")
            }
            task_tags_element.appendChild (element)
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
        let changed = false
        for (const field of ["short_name", "long_name", "description"]) {
            if (selected_task[field] != task_info_inputs[field].value) {
                selected_task[field] = task_info_inputs[field].value
                changed = true
            }
        }
        if (changed) {
            log_automatic_update(selected_task, "ChangedInfo")
            send("UpdateTask", selected_task)
        }
    }
}

const container_padding = 10
function update_container_ui(id) {
    const cache = container_ui_cache_map.get(id)
    const task = tasks_map.get(id)
    const drag = ongoing_drags.get(id)
    if (drag?.disturbed) {
        cache.view_within = drag.imposed_view_within_task
    }
    else if (id === null) {
        cache.view_within = global_view
        cache.z_index = 0
    } else {
        cache.view_within = view_upon_task_to_view_upon_children(cache.view_upon, task)
    }
    if (cache.children.length === 0) {
        cache.z_index += 100
        cache.view_bounds = {
            top: cache.view_within.view_location_of_inner_origin[1],
            left: cache.view_within.view_location_of_inner_origin[0],
            right: cache.view_within.view_location_of_inner_origin[0],
            bottom: cache.view_within.view_location_of_inner_origin[1],
        }
    }
    else {
        cache.view_bounds = {
            top: Infinity,
            left: Infinity,
            right: -Infinity,
            bottom: -Infinity,
        }
    }
    for (const child of cache.children) {
        const child_cache = container_ui_cache_map.get(child.id)
        child_cache.view_upon = cache.view_within
        child_cache.z_index = cache.z_index + 1
        update_container_ui(child.id)
        for (const bound of ["top", "left"]) {
            const forced = child_cache.view_bounds[bound] - container_padding
//            console.log(forced, cache.view_bounds[bound])
            if (forced < cache.view_bounds[bound]) {
                cache.view_bounds[bound] = forced
            }
        }
        for (const bound of ["right", "bottom"]) {
            const forced = child_cache.view_bounds[bound] + container_padding
            if (forced > cache.view_bounds[bound]) {
                cache.view_bounds[bound] = forced
            }
        }
    }
    for (const bound of ["top", "bottom", "left", "right"]) {
        if(!Number.isFinite(cache.view_bounds[bound])) {
            throw new Error();
        }
    }
    for (const [a,b] of [["top", "bottom"], ["left", "right"]]) {
        const diff = cache.view_bounds[b] - cache.view_bounds[a]
        let expansion = 0.1
        if (id === null) {
            expansion = 0.3
        }
        cache.view_bounds[a] -= diff*expansion
        cache.view_bounds[b] += diff*expansion
    }
    if (id !== null) {
        update_task_ui(task)
    }
    let bounds_element
    if (id === null) {
        bounds_element = all_tasks_bounds_element
    } else {
        bounds_element = document.getElementById(id)
    }
    bounds_element.style.zIndex = cache.z_index
//console.log (id, cache)
    if (cache.children.length > 0) {
        for (const bound of ["top", "left", "right", "bottom"]) {
            bounds_element.style[bound] = cache.view_bounds[bound]+"px"
        }
        bounds_element.style.height = (cache.view_bounds.bottom - cache.view_bounds.top)+"px"
        bounds_element.style.width = (cache.view_bounds.right - cache.view_bounds.left)+"px"
    } else {
        const view_location = cache.view_within.view_location_of_inner_origin
        bounds_element.style.left = view_location[0]+"px"
        bounds_element.style.top = view_location[1]+"px"
        bounds_element.style.removeProperty("bottom")
        bounds_element.style.removeProperty("right")
        bounds_element.style.removeProperty("width")
        bounds_element.style.removeProperty("height")
    }
}

function update_task_ui(task, view_upon_task) {
    let task_element = document.getElementById (task.id)
    const cache = container_ui_cache_map.get(task.id)
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
            start_dragging_task(task.id, "mouse", eventlike_view_location(event))
            event.preventDefault()
            event.stopPropagation()
        })
        task_element.addEventListener("touchstart", (event) => {
            for (const touch of event.changedTouches) {
                start_dragging_task(task.id, touch.identifier, eventlike_view_location(touch))
            }
            event.preventDefault()
            event.stopPropagation()
        })
        tasks_element.appendChild(task_element)
    }
    task_element.innerText = task.short_name
    if (cache.children.length > 0) {
        task_element.className = "task task_group"
    } else {
        task_element.className = "task single_task"
    }

    // TODO: don't be quadratic
//    for (const child of container_ui_cache_map.get(task.id).children) {
//        update_task_ui(child)
//    }
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
        const cache = container_ui_cache_map.get(task_id)
        const tv = cache.view_within
        ongoing_drags.set(task_id, {
            task_id,
            drag_id,
            pointer_location: pointer_location.slice(),
            original_pointer_location: pointer_location.slice(),
            pointer_location_relative_to_task: location_sub(pointer_location, tv.view_location_of_inner_origin),
            view_units_per_task_child_environment_unit: tv.view_units_per_inner_unit,
            disturbed: false,
        })
    }
    console.log("started drag", ongoing_drags)
}

function continue_dragging_task(drag, pointer_location) {
    const threshold = 5
    if (zipWith([pointer_location, drag.original_pointer_location], p => Math.abs(p[0] - p[1])).some(d => d > threshold)) {
        drag.disturbed = true
    }
    if (drag.disturbed) {
        const task = tasks_map.get(drag.task_id)
        drag.imposed_view_within_task = {
             view_location_of_inner_origin: location_sub(pointer_location, drag.pointer_location_relative_to_task),
             view_units_per_inner_unit: drag.view_units_per_task_child_environment_unit,
         }
        update_container_ui(drag.task_id)
    }
    drag.pointer_location = pointer_location.slice()
//    console.log("continued drag")
}

function cancel_dragging_task (drag) {
    const task = tasks_map.get(drag.task_id)
    ongoing_drags.delete(drag.task_id)
}

function finish_dragging_task (drag) {
    const task = tasks_map.get(drag.task_id)
    if (drag.disturbed) {
        const cache = container_ui_cache_map.get(drag.task_id)
        const pv = cache.view_upon
        task.location = view_location_to_inner_location(pv, drag.imposed_view_within_task.view_location_of_inner_origin)
//        console.log(drag, pv)
        task.my_environment_units_per_child_environment_unit = drag.imposed_view_within_task.view_units_per_inner_unit / pv.view_units_per_inner_unit
        send("UpdateTask", task)
    }
    ongoing_drags.delete(drag.task_id)
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
    tasks_map.clear()
    container_ui_cache_map.clear()
    container_ui_cache_map.set(null, {children:[]})
    for (task of collection.tasks) {
        tasks_map.set(task.id, task)
        container_ui_cache_map.set(task.id, {children:[]})
    }
    for (task of collection.tasks) {
        container_ui_cache_map.get(task.parent_id).children.push(task)
    }

    update_container_ui(null)
    global_tags = collection.tags
//    for (const tag of collection.tags) {
//        task_tags_element.
//    }
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
