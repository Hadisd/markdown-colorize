// :shortcode: emoji, the common GitHub ones. Written as "name=character" pairs to stay short.
const PAIRS = `smile=😄 smiley=😃 grin=😁 grinning=😀 joy=😂 laughing=😆 wink=😉 blush=😊 heart_eyes=😍 sunglasses=😎
thinking=🤔 neutral_face=😐 confused=😕 cry=😢 sob=😭 scream=😱 angry=😠 rage=😡 sweat_smile=😅 innocent=😇
slightly_smiling_face=🙂 upside_down_face=🙃 sleeping=😴 mask=😷 nerd_face=🤓 relieved=😌 pensive=😔 worried=😟
rocket=🚀 tada=🎉 sparkles=✨ fire=🔥 star=⭐ star2=🌟 zap=⚡ boom=💥 bulb=💡 bug=🐛 memo=📝 pencil=📝 pencil2=✏️
book=📖 books=📚 bookmark=🔖 link=🔗 lock=🔒 unlock=🔓 key=🔑 wrench=🔧 hammer=🔨 hammer_and_wrench=🛠️ gear=⚙️
package=📦 white_check_mark=✅ heavy_check_mark=✔️ x=❌ warning=⚠️ no_entry=⛔ no_entry_sign=🚫 question=❓
exclamation=❗ grey_question=❔ information_source=ℹ️ +1=👍 thumbsup=👍 -1=👎 thumbsdown=👎 clap=👏 pray=🙏
muscle=💪 wave=👋 ok_hand=👌 raised_hands=🙌 eyes=👀 point_right=👉 point_left=👈 point_up=☝️ point_down=👇
heart=❤️ broken_heart=💔 blue_heart=💙 green_heart=💚 purple_heart=💜 yellow_heart=💛 orange_heart=🧡
black_heart=🖤 white_heart=🤍 100=💯 trophy=🏆 gift=🎁 bell=🔔 mega=📣 loudspeaker=📢 calendar=📆 date=📅
clock=🕒 hourglass=⌛ chart_with_upwards_trend=📈 chart_with_downwards_trend=📉 bar_chart=📊 clipboard=📋
pushpin=📌 round_pushpin=📍 paperclip=📎 scissors=✂️ art=🎨 musical_note=🎵 computer=💻 keyboard=⌨️
iphone=📱 email=📧 envelope=✉️ inbox_tray=📥 outbox_tray=📤 globe_with_meridians=🌐 earth_americas=🌎
sun=☀️ sunny=☀️ cloud=☁️ rainbow=🌈 snowflake=❄️ umbrella=☔ coffee=☕ tea=🍵 beer=🍺 pizza=🍕
hamburger=🍔 cake=🍰 apple=🍎 banana=🍌 dog=🐶 cat=🐱 bird=🐦 penguin=🐧 whale=🐳 unicorn=🦄 turtle=🐢
snake=🐍 bee=🐝 butterfly=🦋 seedling=🌱 evergreen_tree=🌲 deciduous_tree=🌳 four_leaf_clover=🍀 rose=🌹
tulip=🌷 sunflower=🌻 construction=🚧 rotating_light=🚨 shield=🛡️ mag=🔍 mag_right=🔎 microscope=🔬
telescope=🔭 test_tube=🧪 dna=🧬 moneybag=💰 dollar=💵 credit_card=💳 gem=💎 crown=👑 checkered_flag=🏁
triangular_flag_on_post=🚩 white_flag=🏳️ red_circle=🔴 large_blue_circle=🔵 green_circle=🟢 yellow_circle=🟡
orange_circle=🟠 purple_circle=🟣 black_circle=⚫ white_circle=⚪ arrow_right=➡️ arrow_left=⬅️ arrow_up=⬆️
arrow_down=⬇️ arrow_forward=▶️ rewind=⏪ repeat=🔁 recycle=♻️ soon=🔜 new=🆕 free=🆓 up=🆙 ok=🆗 sos=🆘
copyright=©️ registered=®️ tm=™️ construction_worker=👷 robot=🤖 ghost=👻 alien=👽 skull=💀 poop=💩 see_no_evil=🙈
hear_no_evil=🙉 speak_no_evil=🙊 handshake=🤝 raised_hand=✋ v=✌️ crossed_fingers=🤞 fist=✊ writing_hand=✍️
brain=🧠 bomb=💣 hourglass_flowing_sand=⏳ stopwatch=⏱️ alarm_clock=⏰ battery=🔋 electric_plug=🔌
floppy_disk=💾 cd=💿 camera=📷 movie_camera=🎥 tv=📺 radio=📻 microphone=🎤 headphones=🎧 guitar=🎸 video_game=🎮
dart=🎯 puzzle_piece=🧩 jigsaw=🧩 label=🏷️ file_folder=📁 open_file_folder=📂 page_facing_up=📄 spiral_notepad=🗒️
card_index=📇 triangular_ruler=📐 straight_ruler=📏 abacus=🧮 receipt=🧾 chains=⛓️ toolbox=🧰 magnet=🧲 ladder=🪜
anchor=⚓ airplane=✈️ car=🚗 bike=🚲 ship=🚢 house=🏠 office=🏢 school=🏫 hospital=🏥 bank=🏦 mountain=⛰️ ocean=🌊
volcano=🌋 earth_africa=🌍 earth_asia=🌏 full_moon=🌕 crescent_moon=🌙 comet=☄️ milky_way=🌌 stars=🌠`

export const EMOJI: Record<string, string> = Object.fromEntries(
  PAIRS.split(/\s+/)
    .filter(Boolean)
    .map((pair) => {
      const at = pair.lastIndexOf('=')
      return [pair.slice(0, at), pair.slice(at + 1)]
    })
)
