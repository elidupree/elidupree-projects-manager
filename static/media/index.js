
const canvas = document.getElementById ("canvas")
const context = canvas.getContext ("2d")
const password_input = document.getElementById ("password")
const main_interface_element = document.getElementById ("main_interface")
const collection_element = document.getElementById ("collection")

let socket = null
let interface_ready = false
let selected_task_id = null
const tasks_map = new Map()

const task_info_inputs = {}

function send(variant, contents) {
  if (socket !== null && socket.readyState == 1) {
    socket.send(JSON.stringify({[variant]: contents}))
  }
}

for (const input of document.querySelectorAll("#task_info [name]")) {
    task_info_inputs[input.name] = input
}

collection_element.addEventListener("click", (event) => {
    const bounds = collection_element.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    const new_task = {
        id: crypto.randomUUID(),

        short_name: "",
        long_name: "",
        description: "",

        location: [x, y],
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

function update_task_data_from_info_panel() {
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
            set_selected(task_element.id)
            event.stopPropagation()
        })
        collection_element.appendChild(task_element)
    }
    task_element.innerText = task.short_name
    task_element.style.left = task.location[0]+"px"
    task_element.style.top = task.location[1]+"px"
}

for (const [name,input] of Object.entries(task_info_inputs)) {
    input.addEventListener("change", update_task_data_from_info_panel)
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
      console.log('Received: ' + ev.data)
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
