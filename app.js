const express = require('express')
const crypto  = require('crypto')
const xml2js  = require('xml2js')
const axios   = require('axios')

const app  = express()
const PORT = process.env.PORT || 80
const TOKEN = 'wechatrm'

// 原始 body 读取（微信推送是 XML）
app.use(express.text({ type: 'text/xml' }))
app.use(express.text({ type: 'application/xml' }))
app.use(express.text({ type: '*/*' }))

// ===== 微信服务器验证（GET）=====
app.get('/wxmsg', (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query
  const arr  = [TOKEN, timestamp, nonce].sort()
  const hash = crypto.createHash('sha1').update(arr.join('')).digest('hex')
  if (hash === signature) {
    console.log('微信验证通过')
    res.send(echostr)
  } else {
    console.log('微信验证失败')
    res.status(403).send('Forbidden')
  }
})

// ===== 接收微信消息推送（POST）=====
app.post('/wxmsg', async (req, res) => {
  // 必须先回 success，否则微信会重试
  res.send('success')

  const body = req.body
  console.log('收到原始消息:', body)

  try {
    const parsed = await xml2js.parseStringPromise(body, { explicitArray: false })
    const msg    = parsed.xml
    console.log('解析后消息:', JSON.stringify(msg))

    const openid  = msg.FromUserName
    const appid   = msg.ToUserName
    const msgType = msg.MsgType

    // 用户进入客服会话事件
    if (msgType === 'event' && msg.Event === 'user_enter_tempsession') {
      await sendTextMsg(appid, openid, '欢迎使用寄梦去水印客服 🎬\n\n请直接将视频号视频转发到此对话，系统自动提取无水印链接。')
      return
    }

    // 视频号视频转发消息
    if (msgType === 'miniprogrampage' || msg.FinderFeed) {
      const feed = msg.FinderFeed || {}

      // 穷举所有可能的字段名（大小写变体）
      const videoUrl =
        feed.cdnVideoUrl   || feed.CdnVideoUrl   ||
        feed.cdn_video_url || feed.videoUrl       ||
        feed.VideoUrl      || feed.video_url      || ''

      const feedId   = feed.feedId   || feed.FeedId   || ''
      const username = feed.username || feed.Username || ''

      console.log('feedId:', feedId, 'cdnVideoUrl:', videoUrl)
      // 打印完整 FinderFeed 便于分析未知字段
      console.log('FinderFeed 完整字段:', JSON.stringify(feed, null, 2))

      if (videoUrl) {
        await sendTextMsg(appid, openid,
          '✅ 视频号去水印成功！\n\n复制下方链接，在浏览器打开即可保存：\n\n' + videoUrl)
      } else {
        await sendTextMsg(appid, openid,
          '⚠️ 暂未能提取直链，请将视频分享链接粘贴到小程序内去水印。\n\n（feedId: ' + feedId + '）')
      }

    } else if (msgType === 'text') {
      await sendTextMsg(appid, openid,
        '请直接将视频号视频转发到此对话，系统自动提取无水印链接 🎬\n\n其他平台（抖音/小红书/快手等）请打开小程序粘贴链接。')

    } else {
      console.log('未处理消息类型:', msgType)
    }

  } catch (err) {
    console.error('消息处理出错:', err.message)
  }
})

// ===== 发送客服文本消息 =====
async function sendTextMsg (appid, openid, content) {
  try {
    // 云托管：http:// + access_token 作为查询参数，平台自动替换 CLOUD_ACCESS_TOKEN
    const res = await axios.post(
      'http://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=CLOUD_ACCESS_TOKEN',
      { touser: openid, msgtype: 'text', text: { content } },
      { timeout: 8000 }
    )
    console.log('客服消息发送结果:', res.data)
  } catch (err) {
    console.error('客服消息发送失败:', err.message)
  }
}

// 健康检查
app.get('/', (_req, res) => res.send('OK'))

app.listen(PORT, () => {
  console.log('服务启动，端口:', PORT)
})
